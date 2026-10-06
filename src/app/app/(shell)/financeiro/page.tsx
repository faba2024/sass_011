import Link from "next/link";
import { PeriodPicker, resolvePeriod } from "@/components/app/period-picker";
import { LinkButton } from "@/components/ui/button";
import { BarChart, RankList, SplitBar } from "@/components/ui/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { Stat, StatStrip } from "@/components/ui/stat";
import { ErrorState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { EXPENSE_CATEGORIES, PAYMENT_METHOD } from "@/lib/constants";
import { date, integer, money, percent, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";

export const metadata = { title: "Financeiro" };

interface Fin {
  income: number; refunds: number; expenses: number; cmv: number; profit: number; orders: number; avg_ticket: number; cancelled: number; cancelled_value: number;
  by_method: { method: PaymentMethod; amount: number }[]; expenses_by_category: { category: string; amount: number }[];
  daily: { date: string; income: number; expenses: number }[]; pending_expenses: { id: string; description: string; category: string; amount: number; due_date: string }[];
}

const METHOD_COLOR: Record<string, string> = { pix: "bg-pickle-500", cash: "bg-mustard-500", card: "bg-blueberry-500", card_online: "bg-grape-500" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requirePage("finance.view", "financeiro");
  const { from, to } = resolvePeriod(await searchParams, ctx.org.timezone);
  const supabase = await createClient();
  const [{ data, error }, { data: margins }] = await Promise.all([
    supabase.rpc("finance_summary", { p_org: ctx.org.id, p_from: from, p_to: to }),
    supabase.from("product_costs").select("product_id, name, sale_price, cost, margin, margin_pct, recipe_items").eq("organization_id", ctx.org.id).order("margin_pct", { ascending: true }).limit(8),
  ]);
  if (error || !data) return <ErrorState description={error?.message} />;
  const f = data as Fin;
  const net = Number(f.income) - Number(f.refunds);
  const grossMargin = net > 0 ? ((net - Number(f.cmv)) / net) * 100 : 0;
  return (
    <>
      <PageHeader title="Financeiro" description={`${date(from)} a ${date(to)} · receita reconhecida no pagamento do pedido`} actions={<LinkButton href="/app/despesas" size="sm" icon="receipt">Despesas</LinkButton>} />
      <div className="mb-4"><PeriodPicker from={from} to={to} /></div>
      <StatStrip>
        <Stat label="Receita líquida" value={money(net)} hint={Number(f.refunds) ? `${money(f.refunds)} em estornos` : `${integer(f.orders)} pedidos`} />
        <Stat label="Despesas pagas" value={money(f.expenses)} hint={`CMV ${money(f.cmv)}`} />
        <Stat label="Lucro estimado" value={money(f.profit)} hint={`margem bruta ${percent(grossMargin)}`} />
        <Stat label="Ticket médio" value={money(f.avg_ticket)} hint={f.cancelled ? `${f.cancelled} cancelado(s) · ${money(f.cancelled_value)}` : "sem cancelamentos"} />
      </StatStrip>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Entradas por dia" description="Receita líquida de pedidos pagos" />
            <BarChart data={f.daily.map((d) => ({ label: shortDate(d.date), value: Number(d.income), hint: `${shortDate(d.date)} · despesas ${money(d.expenses)} · receita` }))} format={money} height={190} />
          </Card>
          <Card>
            <CardHeader title="Resultado do período" description="DRE simplificado" />
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt>Receita de vendas</dt><dd className="num">{money(f.income)}</dd></div>
              <div className="flex justify-between text-muted"><dt>(−) Estornos</dt><dd className="num">{money(f.refunds)}</dd></div>
              <div className="flex justify-between text-muted"><dt>(−) Custo das mercadorias vendidas (ficha técnica)</dt><dd className="num">{money(f.cmv)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-medium"><dt>Lucro bruto</dt><dd className="num">{money(net - Number(f.cmv))}</dd></div>
              <div className="flex justify-between text-muted"><dt>(−) Despesas pagas</dt><dd className="num">{money(f.expenses)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-display text-base font-semibold"><dt>Lucro estimado</dt><dd className={`num ${Number(f.profit) < 0 ? "text-ketchup-500" : "text-pickle-700"}`}>{money(f.profit)}</dd></div>
            </dl>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Formas de pagamento" />
            {f.by_method.length ? <SplitBar parts={f.by_method.map((m) => ({ label: PAYMENT_METHOD[m.method], value: Number(m.amount), color: METHOD_COLOR[m.method] }))} format={money} /> : <p className="text-[13px] text-muted">Sem receitas no período.</p>}
          </Card>
          <Card>
            <CardHeader title="Despesas por categoria" />
            <RankList items={f.expenses_by_category.map((e) => ({ label: EXPENSE_CATEGORIES[e.category] ?? e.category, value: Number(e.amount) }))} format={money} empty="Nenhuma despesa paga" />
          </Card>
          <Card>
            <CardHeader title="Contas a pagar (7 dias)" actions={<Link href="/app/despesas" className="text-xs font-medium text-ember-600 hover:underline">Ver todas</Link>} />
            {f.pending_expenses.length === 0 ? <p className="text-[13px] text-muted">Nada vencendo.</p> : (
              <ul className="divide-y divide-line text-[13px]">
                {f.pending_expenses.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 py-2"><span><span className="block font-medium">{e.description}</span><span className={`text-xs ${e.due_date < to ? "text-ketchup-500" : "text-muted"}`}>vence {date(e.due_date)}</span></span><span className="num font-semibold">{money(e.amount)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Menores margens" description="Custo pela ficha técnica" />
            <ul className="space-y-1.5 text-[13px]">
              {(margins ?? []).map((m: { product_id: string; name: string; cost: number; sale_price: number; margin_pct: number; recipe_items: number }) => (
                <li key={m.product_id} className="flex justify-between gap-2"><span className="truncate">{m.name}{Number(m.recipe_items) === 0 && <span className="ml-1 text-xs text-mustard-700">sem ficha</span>}</span><span className="num shrink-0 text-muted">{money(m.cost)} → {money(m.sale_price)} · <b className={Number(m.margin_pct) < 50 ? "text-mustard-700" : "text-pickle-700"}>{percent(m.margin_pct)}</b></span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
