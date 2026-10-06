import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ZonesManager, type Zone } from "./zones-manager";

export const metadata = { title: "Áreas de entrega" };

export default async function DeliveryPage() {
  const ctx = await requirePage("delivery.manage", "delivery");
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data }, { data: orders }] = await Promise.all([
    supabase.from("delivery_zones").select("id, name, zip_prefixes, fee, min_order, eta_min, eta_max, is_active, sort").eq("organization_id", ctx.org.id).is("deleted_at", null).order("sort"),
    supabase.from("orders").select("delivery_zone_id").eq("organization_id", ctx.org.id).eq("type", "delivery").neq("status", "cancelled").gte("created_at", since),
  ]);
  const counts: Record<string, number> = {};
  for (const o of orders ?? []) if (o.delivery_zone_id) counts[o.delivery_zone_id] = (counts[o.delivery_zone_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Áreas de entrega" description="Taxa, pedido mínimo e tempo por bairro ou faixa de CEP. O checkout escolhe a área automaticamente." />
      <ZonesManager zones={(data ?? []) as Zone[]} orders30d={counts} />
    </>
  );
}
