import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPixPayload } from "@/lib/pix";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicOrder } from "@/lib/types";
import { OrderTracker } from "./order-tracker";

export const metadata: Metadata = { title: "Acompanhar pedido", robots: { index: false } };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { slug, id } = await params;
  const { novo } = await searchParams;
  if (!/^[a-f0-9]{32}$/.test(id)) notFound();
  const supabase = createPublicClient();
  const [{ data }, { data: pixInfo }] = await Promise.all([
    supabase.rpc("get_public_order", { p_token: id }),
    supabase.rpc("get_order_pix", { p_token: id }),
  ]);
  const order = data as PublicOrder | null;
  if (!order || order.org.slug !== slug) notFound();
  const pix =
    order.payment_method === "pix" && order.org.pix_key
      ? buildPixPayload({ key: order.org.pix_key, keyType: order.org.pix_key_type, name: order.org.pix_holder_name ?? order.org.name, city: order.org.pix_city ?? "BRASIL", amount: Number(order.total), txid: `PED${order.number}` })
      : null;
  return <OrderTracker initial={order} justPlaced={novo === "1"} pixCode={pix} pixOnline={Boolean((pixInfo as { online?: boolean } | null)?.online)} />;
}
