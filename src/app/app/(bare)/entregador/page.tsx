import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/button";
import { requirePage } from "@/lib/auth";
import { ORDER_SELECT, sortItems } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithItems } from "@/lib/types";
import { DriverApp } from "./driver-app";

export const metadata = { title: "Minhas entregas" };

export default async function DriverPage() {
  const ctx = await requirePage("deliveries.own", "delivery");
  const supabase = await createClient();
  const { data: driver } = await supabase.from("drivers").select("id, name, status, vehicle").eq("organization_id", ctx.org.id).eq("user_id", ctx.userId).maybeSingle();
  if (!driver) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <EmptyState icon="bike" title="Você não está cadastrado como entregador" description="Peça ao gerente para definir sua função como Entregador em Funcionários." action={<LinkButton href="/app">Voltar ao painel</LinkButton>} />
      </main>
    );
  }
  const today = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  const [{ data: orders }, { data: templates }] = await Promise.all([
    supabase.from("orders").select(ORDER_SELECT).eq("organization_id", ctx.org.id).eq("driver_id", driver.id).or(`status.in.(confirmed,preparing,ready,out_for_delivery),and(status.eq.delivered,delivered_at.gte.${today})`).order("created_at"),
    supabase.from("whatsapp_templates").select("key, body").eq("organization_id", ctx.org.id).eq("is_active", true),
  ]);
  return (
    <DriverApp
      driver={driver as { id: string; name: string; status: "available" | "on_delivery" | "offline"; vehicle: string | null }}
      orders={((orders ?? []) as OrderWithItems[]).map(sortItems)}
      templates={(templates ?? []) as { key: string; body: string }[]}
    />
  );
}
