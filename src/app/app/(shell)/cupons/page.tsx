import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CouponsManager, type Coupon } from "./coupons-manager";

export const metadata = { title: "Cupons" };

export default async function CouponsPage() {
  const ctx = await requirePage("coupons.manage", "cupons");
  const supabase = await createClient();
  const [{ data: coupons }, { data: products }, { data: red }] = await Promise.all([
    supabase.from("coupons").select("*").eq("organization_id", ctx.org.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("products").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("coupon_redemptions").select("coupon_id, discount").eq("organization_id", ctx.org.id),
  ]);
  const totals: Record<string, number> = {};
  for (const r of red ?? []) totals[r.coupon_id] = (totals[r.coupon_id] ?? 0) + Number(r.discount);
  return (
    <>
      <PageHeader title="Cupons" description="Validados no servidor no momento do pedido: validade, limite, uso por cliente, mínimo e produtos." />
      <CouponsManager coupons={(coupons ?? []) as Coupon[]} products={products ?? []} discountTotals={totals} tz={ctx.org.timezone} />
    </>
  );
}
