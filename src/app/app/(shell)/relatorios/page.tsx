import Link from "next/link";
import { PeriodPicker } from "@/components/app/period-picker";
import { resolvePeriod } from "@/lib/period";
import { Badge } from "@/components/ui/badge";
import { BarChart, RankList, SplitBar } from "@/components/ui/charts";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/layout";
import { Stat, StatStrip } from "@/components/ui/stat";
import { ErrorState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { ORDER_TYPE, PAYMENT_METHOD, WEEKDAYS_SHORT } from "@/lib/constants";
import { date, dateTime, integer, money, percent, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { OrderType, PaymentMethod } from "@/lib/types";
import { ExportButton } from "./export-button";

export const metadata = { title: "Relatórios" };

interface Report {
  totals: { revenue: number; orders: number; avg_ticket: number; discounts: number; delivery_fees: number; cancelled: number; cancelled_value: number };
  by_day: { date: string; revenue: number; orders: number }[];
  by_month: { month: string; revenue: number; orders: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  bottom_products: { name: string; qty: number; revenue: number }[];
  margins: { name: string; sale_price: number; cost: number; margin: number; margin_pct: number; recipe_items: number; qty: number; total_margin: number }[];
  by_hour: { hour: number; orders: number; revenue: number }[];
  by_weekday: { dow: number; orders: number; revenue: number }[];
  customers: { unique: number; returning: number; new: number; top: { id: string; name: string; orders: number; spent: number }[] };
  coupons: { code: string; uses: number; discount: number; revenue: number }[];
  by_type: { type: OrderType; orders: number; revenue: number }[];
  by_payment: { method: PaymentMethod; orders: number; revenue: number }[];
  cancellations: { number: number; customer_name: string | null; total: number; reason: string | null; cancelled_at: string }[];
}

const TYPE_COLOR: Record<string, string> = { delivery: "bg-grape-500", pickup: "bg-blueberry-500", dine_in: "bg-mustard-500", counter: "bg-ember-500" };
const PAY_COLOR: Record<string, string> = { pix: "bg-pickle-500", cash: "bg-mustard-500", card: "bg-blueberry-500", card_online: "bg-grape-500" };
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requirePage("reports.view", "relatorios");
  const { from, to } = resolvePeriod(await searchParams, ctx.org.timezone);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_overview", { p_org: ctx.org.id, p_from: from, p_to: to });
  if (error || !data) return <ErrorState description={error?.message} />;
  const r = data as Report;
  const peak = [...r.by_hour].sort((a, b) => b.orders - a.orders)[0];
  const bestDay = [...r.by_weekday].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];
  const tz = ctx.org.timezone;

  return (
    <>
      <PageHeader title="Relatórios" description={`${date(from)} a ${date(to)} · pedidos não cancelados`} />
      <div className="mb-4"><PeriodPicker from={from} to={to} /></div>
      <StatStrip>
        <Stat label="Faturamento" value={money(r.totals.revenue)} hint={`${money(r.totals.delivery_fees)} em taxas de entrega`} />
        <Stat label="Pedidos" value={integer(r.totals.orders)} hint={`${r.totals.cancelled} cancelado(s)`} />
        <Stat label="Ticket médio" value={money(r.totals.avg_ticket)} hint={`${money(r.totals.discounts)} em descontos`} />
        <Stat label="Clientes" value={integer(r.customers.unique)} hint={`${r.customers.returning} recorrentes · ${r.customers.new} novos`} />
      </StatStrip>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader title="Vendas por dia" actions={<ExportButton name="vendas-por-dia" rows={r.by_day} columns={[{ key: "date", label: "Data" }, { key: "orders", label: "Pedidos" }, { key: "revenue", label: "Faturamento" }]} />} />
          <BarChart data={r.by_day.map((d) => ({ label: shortDate(d.date), value: Number(d.revenue), hint: `${shortDate(d.date)} · ${d.orders} pedidos ·` }))} format="money" height={200} />
        </Card>
        <Card>
          <CardHeader title="Horários de pico" description={peak && peak.orders ? `Pico às ${peak.hour}h (${peak.orders} pedidos)` : undefined} />
          <BarChart data={r.by_hour.filter((h) => h.hour >= 10).map((h) => ({ label: `${h.hour}h`, value: h.orders, hint: `${h.hour}h · ${money(h.revenue)} ·` }))} format="orders" height={160} color="bg-mustard-500" />
        </Card>
        <Card>
          <CardHeader title="Dias mais fortes" description={bestDay && Number(bestDay.revenue) ? `${WEEKDAYS_SHORT[bestDay.dow]} lidera com ${money(bestDay.revenue)}` : undefined} />
          <BarChart data={r.by_weekday.map((d) => ({ label: WEEKDAYS_SHORT[d.dow], value: Number(d.revenue), hint: `${d.orders} pedidos ·` }))} format="money" height={160} color="bg-blueberry-500" />
        </Card>
        <Card>
          <CardHeader title="Mais vendidos" actions={<ExportButton name="mais-vendidos" rows={r.top_products} columns={[{ key: "name", label: "Produto" }, { key: "qty", label: "Quantidade" }, { key: "revenue", label: "Receita" }]} />} />
          <RankList items={r.top_products.map((p) => ({ label: p.name, value: p.qty, sub: money(p.revenue) }))} format="times" />
        </Card>
        <Card>
          <CardHeader title="Menos vendidos" description="Candidatos a sair do cardápio ou ganhar destaque" />
          <ul className="divide-y divide-line text-[13px]">{r.bottom_products.map((p) => <li key={p.name} className="flex justify-between py-1.5"><span>{p.name}</span><span className="num text-muted">{p.qty}× · {money(p.revenue)}</span></li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="Delivery × retirada × local" />
          <SplitBar parts={r.by_type.map((t) => ({ label: ORDER_TYPE[t.type].short, value: Number(t.revenue), color: TYPE_COLOR[t.type] }))} format="money" />
          <ul className="mt-3 space-y-1 text-[13px]">{r.by_type.map((t) => <li key={t.type} className="flex justify-between"><span>{ORDER_TYPE[t.type].label}</span><span className="num text-muted">{t.orders} pedidos · {money(t.revenue)}</span></li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="Formas de pagamento" />
          <SplitBar parts={r.by_payment.map((p) => ({ label: PAYMENT_METHOD[p.method], value: Number(p.revenue), color: PAY_COLOR[p.method] }))} format="money" />
          <ul className="mt-3 space-y-1 text-[13px]">{r.by_payment.map((p) => <li key={p.method} className="flex justify-between"><span>{PAYMENT_METHOD[p.method]}</span><span className="num text-muted">{p.orders} pedidos · {money(p.revenue)}</span></li>)}</ul>
        </Card>
        <Card className="xl:col-span-2" padded={false}>
          <div className="flex items-center justify-between px-5 pb-2 pt-4"><h2 className="font-display text-[15px] font-semibold">Margem por produto</h2><ExportButton name="margens" rows={r.margins} columns={[{ key: "name", label: "Produto" }, { key: "qty", label: "Vendidos" }, { key: "cost", label: "Custo" }, { key: "sale_price", label: "Preço" }, { key: "margin", label: "Margem unit." }, { key: "margin_pct", label: "Margem %" }, { key: "total_margin", label: "Margem total" }]} /></div>
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Produto</Th><Th align="right">Vendidos</Th><Th align="right">Custo</Th><Th align="right">Preço</Th><Th align="right">Margem unit.</Th><Th align="right">%</Th><Th align="right">Margem total</Th></tr></thead>
            <tbody>
              {r.margins.map((m) => (
                <tr key={m.name}>
                  <Td className="font-medium">{m.name}{Number(m.recipe_items) === 0 && <Badge tone="mustard" className="ml-2">sem ficha</Badge>}</Td>
                  <Td align="right" className="num">{m.qty}</Td>
                  <Td align="right" className="num">{money(m.cost)}</Td>
                  <Td align="right" className="num">{money(m.sale_price)}</Td>
                  <Td align="right" className="num">{money(m.margin)}</Td>
                  <Td align="right" className="num">{percent(m.margin_pct)}</Td>
                  <Td align="right" className="num font-semibold">{money(m.total_margin)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Clientes que mais compraram" />
          <ol className="space-y-1.5 text-[13px]">{r.customers.top.map((c, i) => <li key={c.id} className="flex justify-between gap-2"><span className="flex gap-2"><span className="num w-4 text-faint">{i + 1}</span><Link href={`/app/clientes/${c.id}`} className="hover:text-ember-600">{c.name}</Link></span><span className="num text-muted">{c.orders} pedidos · {money(c.spent)}</span></li>)}</ol>
        </Card>
        <Card>
          <CardHeader title="Cupons" />
          {r.coupons.length === 0 ? <p className="text-[13px] text-muted">Nenhum cupom usado no período.</p> : (
            <ul className="divide-y divide-line text-[13px]">{r.coupons.map((c) => <li key={c.code} className="flex justify-between py-1.5"><span className="font-mono font-semibold">{c.code}</span><span className="num text-muted">{c.uses} usos · −{money(c.discount)} · {money(c.revenue)} vendidos</span></li>)}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Vendas por mês" />
          <ul className="divide-y divide-line text-[13px]">{r.by_month.map((m) => <li key={m.month} className="flex justify-between py-1.5"><span>{MONTHS[Number(m.month.slice(5)) - 1]}/{m.month.slice(0, 4)}</span><span className="num">{m.orders} pedidos · <b>{money(m.revenue)}</b></span></li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="Cancelamentos" description={`${r.totals.cancelled} pedido(s) · ${money(r.totals.cancelled_value)}`} actions={<ExportButton name="cancelamentos" rows={r.cancellations} columns={[{ key: "number", label: "Pedido" }, { key: "customer_name", label: "Cliente" }, { key: "total", label: "Valor" }, { key: "reason", label: "Motivo" }, { key: "cancelled_at", label: "Data" }]} />} />
          {r.cancellations.length === 0 ? <p className="text-[13px] text-muted">Nenhum cancelamento no período.</p> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto text-[13px]">{r.cancellations.map((c) => <li key={c.number} className="py-1.5"><span className="font-mono font-semibold">#{c.number}</span> <span className="text-muted">{dateTime(c.cancelled_at, tz)} · {money(c.total)}</span><span className="block text-ink-2">{c.reason}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
