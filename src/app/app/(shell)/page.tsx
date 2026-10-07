import Link from "next/link";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { BarChart, LineChart, RankList } from "@/components/ui/charts";
import { Icon } from "@/components/ui/icons";
import { Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { Stat, StatStrip } from "@/components/ui/stat";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD } from "@/lib/constants";
import { integer, money, number, shortDate, time } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, OrderType, PaymentMethod } from "@/lib/types";

interface Summary {
  today: { revenue: number; orders: number; avg_ticket: number; customers: number; cancelled: number };
  yesterday: { revenue: number; orders: number; avg_ticket: number; customers: number };
  new_customers_today: number;
  sales_14d: { date: string; revenue: number; orders: number }[];
  by_hour: { hour: number; today: number; avg: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  recent_orders: { id: string; number: number; customer_name: string | null; type: OrderType; status: OrderStatus; total: number; payment_method: PaymentMethod; created_at: string }[];
  open_by_status: Partial<Record<OrderStatus, number>>;
  stock_alerts: { id: string; name: string; unit: string; stock_qty: number; min_qty: number; products_affected: number }[];
}

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function DashboardPage() {
  const ctx = await requirePage("dashboard.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_summary", { p_org: ctx.org.id });
  if (error || !data) return <ErrorState description={error?.message} />;
  const s = data as Summary;
  const firstName = ctx.fullName.split(" ")[0];
  const live = s.open_by_status;
  const liveRows: { label: string; statuses: OrderStatus[]; tone: string }[] = [
    { label: "Aguardando confirmação", statuses: ["new", "awaiting_confirmation"], tone: "bg-ember-500" },
    { label: "Na cozinha", statuses: ["confirmed", "preparing"], tone: "bg-mustard-500" },
    { label: "Prontos", statuses: ["ready"], tone: "bg-pickle-500" },
    { label: "Em rota de entrega", statuses: ["out_for_delivery"], tone: "bg-grape-500" },
  ];
  const onboardingPending = !ctx.org.onboarding_completed_at && ctx.permissions.has("settings.manage");

  return (
    <>
      <RealtimeRefresh tables={["orders"]} debounce={1500} />
      <PageHeader
        eyebrow={new Date().toLocaleDateString("pt-BR", { timeZone: ctx.org.timezone, weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting(ctx.org.timezone)}, ${firstName}`}
        description="Como está a operação de hoje."
        actions={
          <>
            <LinkButton href={`/${ctx.org.slug}`} target="_blank" icon="external" size="sm">Cardápio online</LinkButton>
            {ctx.permissions.has("orders.view") && <LinkButton href="/app/pedidos" variant="dark" icon="kanban" size="sm">Painel de pedidos</LinkButton>}
          </>
        }
      />

      {onboardingPending && (
        <Link href="/onboarding" className="mb-5 flex items-center gap-3 rounded-lg border border-mustard-100 bg-mustard-50 px-4 py-3 text-[13px] text-mustard-700 hover:border-mustard-400">
          <Icon name="sparkle" size={16} />
          <span className="flex-1"><b>Configuração inicial:</b> etapa {Math.min(ctx.org.onboarding_step + 1, 6)} de 6. Termine para publicar seu cardápio completo.</span>
          <Icon name="arrow-right" size={15} />
        </Link>
      )}

      <StatStrip>
        <Stat label="Faturamento hoje" value={money(s.today.revenue)} current={s.today.revenue} previous={s.yesterday.revenue} hint="vs. ontem" />
        <Stat label="Pedidos" value={integer(s.today.orders)} current={s.today.orders} previous={s.yesterday.orders} hint={s.today.cancelled ? `${s.today.cancelled} cancelado(s)` : "vs. ontem"} />
        <Stat label="Ticket médio" value={money(s.today.avg_ticket)} current={s.today.avg_ticket} previous={s.yesterday.avg_ticket} hint="vs. ontem" />
        <Stat label="Clientes" value={integer(s.today.customers)} hint={`${s.new_customers_today} novo(s) hoje`} />
      </StatStrip>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Vendas — últimos 14 dias" description={`${money(s.sales_14d.reduce((a, d) => a + Number(d.revenue), 0))} em ${integer(s.sales_14d.reduce((a, d) => a + d.orders, 0))} pedidos`} />
            <LineChart data={s.sales_14d.map((d) => ({ label: shortDate(d.date), value: Number(d.revenue), hint: `${shortDate(d.date)} · ${d.orders} pedidos ·` }))} format="money" height={210} />
          </Card>
          <Card>
            <CardHeader title="Pedidos por horário" description="Barras: hoje · fundo: média diária dos últimos 30 dias" />
            <BarChart
              data={s.by_hour.slice(10).map((h) => ({ label: `${h.hour}h`, value: h.today, hint: `${h.hour}h–${h.hour + 1}h · média ${number(h.avg)} ·` }))}
              ghost={s.by_hour.slice(10).map((h) => Number(h.avg))}
              format="orders"
              height={150}
            />
          </Card>
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="font-display text-[15px] font-semibold">Pedidos recentes</h2>
              {ctx.permissions.has("orders.view") && <Link href="/app/pedidos?view=lista" className="text-xs font-medium text-ember-600 hover:underline">Ver todos</Link>}
            </div>
            {s.recent_orders.length === 0 ? (
              <div className="p-5"><EmptyState compact icon="ticket" title="Nenhum pedido ainda" description="Divulgue o link do seu cardápio para receber o primeiro pedido." /></div>
            ) : (
              <ul className="divide-y divide-line">
                {s.recent_orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/app/pedidos/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-paper">
                      <span className="num w-14 font-mono text-[13px] font-semibold">#{o.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{o.customer_name ?? "Cliente"}</span>
                        <span className="block text-xs text-muted">{ORDER_TYPE[o.type].short} · {PAYMENT_METHOD[o.payment_method]} · {time(o.created_at, ctx.org.timezone)}</span>
                      </span>
                      <Badge tone={ORDER_STATUS[o.status].tone} dot>{ORDER_STATUS[o.status].short}</Badge>
                      <span className="num w-24 text-right text-[13px] font-semibold">{money(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Agora na operação" actions={<span className="flex items-center gap-1.5 text-[11px] font-medium text-pickle-700"><span className="h-1.5 w-1.5 rounded-full bg-pickle-500" />ao vivo</span>} />
            <ul className="space-y-1">
              {liveRows.map((r) => {
                const n = r.statuses.reduce((a, st) => a + (live[st] ?? 0), 0);
                return (
                  <li key={r.label}>
                    <Link href="/app/pedidos" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-sunken">
                      <span className={`h-2.5 w-2.5 rounded-sm ${r.tone}`} />
                      <span className="flex-1 text-[13px] text-ink-2">{r.label}</span>
                      <span className="num font-display text-lg font-semibold">{n}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {ctx.permissions.has("inventory.view") && (
            <Card>
              <CardHeader title="Alertas de estoque" actions={<Link href="/app/estoque" className="text-xs font-medium text-ember-600 hover:underline">Estoque</Link>} />
              {s.stock_alerts.length === 0 ? (
                <p className="flex items-center gap-2 py-3 text-[13px] text-pickle-700"><Icon name="check-circle" size={16} /> Tudo abastecido.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {s.stock_alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <span className={`grid h-7 w-7 place-items-center rounded-md ${Number(a.stock_qty) <= 0 ? "bg-ketchup-50 text-ketchup-500" : "bg-mustard-50 text-mustard-700"}`}>
                        <Icon name="alert" size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{a.name}</span>
                        <span className="block text-xs text-muted">{a.products_affected} produto(s) afetado(s)</span>
                      </span>
                      <span className="num text-right text-xs">
                        <span className={Number(a.stock_qty) <= 0 ? "font-semibold text-ketchup-500" : "font-semibold text-mustard-700"}>{number(a.stock_qty)} {a.unit}</span>
                        <span className="block text-faint">mín. {number(a.min_qty)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Mais vendidos" description="Últimos 7 dias" />
            <RankList items={s.top_products.map((p) => ({ label: p.name, value: p.qty, sub: money(p.revenue) }))} format="times" />
          </Card>
        </div>
      </div>
    </>
  );
}
