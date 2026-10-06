import Link from "next/link";
import { KanbanBoard } from "@/components/orders/kanban-board";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { PageHeader, Table, Td, Th } from "@/components/ui/layout";
import { LinkTabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD } from "@/lib/constants";
import { dateTime, money } from "@/lib/format";
import { fetchActiveOrders } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { OrderRow } from "@/lib/types";
import { ExportOrdersButton, OrdersFilters } from "./orders-filters";

const PAGE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage("orders.view", "pedidos");
  const sp = await searchParams;
  const view = sp.view === "lista" ? "lista" : "quadro";
  const supabase = await createClient();

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Novos pedidos chegam sozinhos, com som e aviso."
        actions={
          <>
            {ctx.permissions.has("kitchen.view") && <LinkButton href="/app/cozinha" icon="flame" size="sm">Tela da cozinha</LinkButton>}
            {ctx.permissions.has("orders.create") && <LinkButton href="/app/pedidos/novo" variant="primary" icon="plus" size="sm">Novo pedido</LinkButton>}
          </>
        }
      />
      <LinkTabs
        active={view}
        className="mb-4"
        items={[
          { value: "quadro", href: "/app/pedidos", label: <span className="flex items-center gap-1.5"><Icon name="kanban" size={15} />Quadro</span> },
          { value: "lista", href: "/app/pedidos?view=lista", label: <span className="flex items-center gap-1.5"><Icon name="list" size={15} />Histórico</span> },
        ]}
      />
      {view === "quadro" ? <KanbanBoard initial={await fetchActiveOrders(supabase, ctx.org.id)} /> : await OrdersList({ orgId: ctx.org.id, tz: ctx.org.timezone, sp })}
    </>
  );
}

async function OrdersList({ orgId, tz, sp }: { orgId: string; tz: string; sp: Record<string, string | undefined> }) {
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page ?? 1));
  let query = supabase
    .from("orders")
    .select("id, number, created_at, status, type, source, customer_name, customer_phone, total, payment_method, payment_status", { count: "exact" })
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.type) query = query.eq("type", sp.type);
  if (sp.from) query = query.gte("created_at", new Date(`${sp.from}T00:00:00-03:00`).toISOString());
  if (sp.to) query = query.lt("created_at", new Date(new Date(`${sp.to}T00:00:00-03:00`).getTime() + 86400000).toISOString());
  if (sp.q) query = /^#?\d+$/.test(sp.q) ? query.eq("number", Number(sp.q.replace("#", ""))) : query.ilike("customer_name", `%${sp.q}%`);
  const { data, count, error } = await query;
  const rows = (data ?? []) as Pick<OrderRow, "id" | "number" | "created_at" | "status" | "type" | "source" | "customer_name" | "customer_phone" | "total" | "payment_method" | "payment_status">[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/app/pedidos?${u.toString()}`;
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <OrdersFilters />
        <ExportOrdersButton />
      </div>
      {error ? (
        <EmptyState icon="alert" title="Erro ao buscar pedidos" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState icon="ticket" title="Nenhum pedido encontrado" description="Ajuste os filtros ou o período." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Pagamento</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-paper">
                  <Td><Link href={`/app/pedidos/${o.id}`} className="num font-mono font-semibold hover:text-ember-600">#{o.number}</Link></Td>
                  <Td className="text-muted">{dateTime(o.created_at, tz)}</Td>
                  <Td><span className="font-medium">{o.customer_name ?? "—"}</span></Td>
                  <Td>{ORDER_TYPE[o.type].short}</Td>
                  <Td>
                    {PAYMENT_METHOD[o.payment_method]}
                    {o.payment_status !== "paid" && o.status !== "cancelled" && <span className="ml-1 text-xs text-mustard-700">(pendente)</span>}
                  </Td>
                  <Td><Badge tone={ORDER_STATUS[o.status].tone} dot>{ORDER_STATUS[o.status].short}</Badge></Td>
                  <Td align="right" className="num font-semibold">{money(o.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>{count} pedido(s)</span>
            <div className="flex items-center gap-2">
              {page > 1 && <LinkButton href={qs(page - 1)} size="sm" icon="chevron-left">Anterior</LinkButton>}
              <span className="num">{page} / {pages}</span>
              {page < pages && <LinkButton href={qs(page + 1)} size="sm" iconRight="chevron-right">Próxima</LinkButton>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
