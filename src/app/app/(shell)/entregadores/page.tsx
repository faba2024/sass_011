import { RealtimeRefresh } from "@/components/app/realtime-refresh";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrderRow } from "@/lib/types";
import { DriversManager, type Driver } from "./drivers-manager";

export const metadata = { title: "Entregadores" };

export default async function DriversPage() {
  const ctx = await requirePage("delivery.manage", "delivery");
  const supabase = await createClient();
  const today = new Date(Date.now() - 18 * 3600000).toISOString();
  const [{ data: drivers }, { data: active }, { data: done }] = await Promise.all([
    supabase.from("drivers").select("id, name, phone, vehicle, plate, status, is_active, user_id").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("orders").select("id, number, customer_name, address, status, driver_id, total, payment_method, payment_status").eq("organization_id", ctx.org.id).eq("type", "delivery").in("status", ["confirmed", "preparing", "ready", "out_for_delivery"]).order("created_at"),
    supabase.from("orders").select("driver_id").eq("organization_id", ctx.org.id).eq("status", "delivered").gte("delivered_at", today).not("driver_id", "is", null),
  ]);
  const deliveredToday: Record<string, number> = {};
  for (const o of done ?? []) deliveredToday[o.driver_id] = (deliveredToday[o.driver_id] ?? 0) + 1;
  return (
    <>
      <RealtimeRefresh tables={["drivers", "orders"]} />
      <PageHeader title="Entregadores" description="Quem está disponível, em rota ou offline — e atribuição rápida dos pedidos de entrega." />
      <DriversManager drivers={(drivers ?? []) as Driver[]} orders={(active ?? []) as Pick<OrderRow, "id" | "number" | "customer_name" | "address" | "status" | "driver_id" | "total" | "payment_method" | "payment_status">[]} deliveredToday={deliveredToday} />
    </>
  );
}
