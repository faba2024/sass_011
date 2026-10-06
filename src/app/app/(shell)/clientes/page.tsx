import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomersList, type CustomerListRow } from "./customers-list";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage("customers.view", "clientes");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, { data: segments }, { data: loyalty }] = await Promise.all([
    supabase.from("customers").select("id, name, phone, email, tags, orders_count, total_spent, last_order_at, created_at").eq("organization_id", ctx.org.id).is("deleted_at", null).order("last_order_at", { ascending: false, nullsFirst: false }).limit(5000),
    supabase.from("customer_segments").select("customer_id, segment, avg_ticket").eq("organization_id", ctx.org.id).limit(5000),
    supabase.from("loyalty_accounts").select("customer_id, points_balance").eq("organization_id", ctx.org.id).limit(5000),
  ]);
  const seg = new Map<string, { segment: string; avg_ticket: number }>((segments ?? []).map((s: { customer_id: string; segment: string; avg_ticket: number }) => [s.customer_id, s]));
  const pts = new Map<string, number>((loyalty ?? []).map((l: { customer_id: string; points_balance: number }) => [l.customer_id, l.points_balance]));
  const rows: CustomerListRow[] = (customers ?? []).map((c: Omit<CustomerListRow, "segment" | "avg_ticket" | "points">) => ({ ...c, segment: seg.get(c.id)?.segment ?? "new", avg_ticket: Number(seg.get(c.id)?.avg_ticket ?? 0), points: pts.get(c.id) ?? 0 }));
  return (
    <>
      <PageHeader title="Clientes" description="Cadastro automático a cada pedido. Segmentos atualizados sozinhos para suas campanhas." />
      <CustomersList rows={rows} initialSegment={sp.segmento ?? ""} canManage={ctx.permissions.has("customers.manage")} tz={ctx.org.timezone} />
    </>
  );
}
