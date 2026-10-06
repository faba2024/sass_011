import { RealtimeRefresh } from "@/components/app/realtime-refresh";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TablesManager, type TableRow } from "./tables-manager";

export const metadata = { title: "Mesas" };

export default async function TablesPage() {
  const ctx = await requirePage("tables.manage", "mesas");
  const supabase = await createClient();
  const [{ data: tables }, { data: sessions }] = await Promise.all([
    supabase.from("dining_tables").select("id, label, seats, status, qr_token, is_active, sort").eq("organization_id", ctx.org.id).is("deleted_at", null).order("sort"),
    supabase.from("table_sessions").select("id, table_id, opened_at, orders(id, number, status, total, customer_name, created_at)").eq("organization_id", ctx.org.id).is("closed_at", null),
  ]);
  return (
    <>
      <RealtimeRefresh tables={["dining_tables", "orders"]} />
      <PageHeader
        title="Mesas"
        description="Cada mesa tem um QR Code próprio: o cliente pede pelo celular e a conta fica vinculada à mesa."
        actions={<LinkButton href="/app/imprimir/mesas" target="_blank" icon="printer" size="sm">Imprimir QR Codes</LinkButton>}
      />
      <TablesManager tables={(tables ?? []) as TableRow[]} sessions={(sessions ?? []) as { id: string; table_id: string; opened_at: string; orders: { id: string; number: number; status: string; total: number; customer_name: string | null; created_at: string }[] }[]} slug={ctx.org.slug} tz={ctx.org.timezone} />
    </>
  );
}
