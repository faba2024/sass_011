import { OrderComposer } from "@/components/pos/order-composer";
import { PageHeader } from "@/components/ui/layout";
import { ErrorState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { getStorefront } from "@/lib/storefront";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Novo pedido" };

export default async function NewOrderPage() {
  const ctx = await requirePage("orders.create");
  const supabase = await createClient();
  const [sf, { data: tables }] = await Promise.all([
    getStorefront(ctx.org.slug),
    supabase.from("dining_tables").select("id, label").eq("organization_id", ctx.org.id).eq("is_active", true).is("deleted_at", null).order("sort"),
  ]);
  if (!sf) return <ErrorState description="Cardápio indisponível." />;
  return (
    <>
      <PageHeader title="Novo pedido" description="Para pedidos por telefone, WhatsApp ou no balcão. Preços e taxas calculados pelo sistema." />
      <OrderComposer sf={sf} tables={tables ?? []} mode="admin" />
    </>
  );
}
