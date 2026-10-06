import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReviewsList, type Review } from "./reviews-list";

export const metadata = { title: "Avaliações" };

export default async function ReviewsPage() {
  const ctx = await requirePage("reviews.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("id, rating, comment, reply, replied_at, is_hidden, created_at, customer_name, customer_id, order:orders(id, number)").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(500);
  return (
    <>
      <PageHeader title="Avaliações" description="Somente clientes com pedido concluído avaliam. A média aparece no cardápio online apenas com avaliações reais e visíveis." />
      <ReviewsList reviews={(data ?? []) as unknown as Review[]} tz={ctx.org.timezone} />
    </>
  );
}
