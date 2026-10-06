import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/orders/order-detail";
import { LinkButton } from "@/components/ui/button";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("orders.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <LinkButton href="/app/pedidos" variant="ghost" size="sm" icon="arrow-left" className="-ml-2 mb-3">Pedidos</LinkButton>
      <OrderDetail orderId={id} />
    </div>
  );
}
