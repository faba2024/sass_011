import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoyaltyManager } from "./loyalty-manager";

export const metadata = { title: "Fidelidade" };

export default async function LoyaltyPage() {
  const ctx = await requirePage("loyalty.manage", "fidelidade");
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: program }, { data: rewards }, { data: products }, { data: top }, { data: txs }] = await Promise.all([
    supabase.from("loyalty_programs").select("is_enabled, points_per_real, rules_text").eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("loyalty_rewards").select("id, name, points_cost, reward_type, product_id, discount_value, is_active").eq("organization_id", ctx.org.id).order("points_cost"),
    supabase.from("products").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("loyalty_accounts").select("customer_id, points_balance, lifetime_points, customer:customers(name, phone)").eq("organization_id", ctx.org.id).order("points_balance", { ascending: false }).limit(10),
    supabase.from("loyalty_transactions").select("kind, points").eq("organization_id", ctx.org.id).gte("created_at", since),
  ]);
  const earned = (txs ?? []).filter((t: { kind: string }) => t.kind === "earn").reduce((a: number, t: { points: number }) => a + t.points, 0);
  const redeemed = (txs ?? []).filter((t: { kind: string }) => t.kind === "redeem").reduce((a: number, t: { points: number }) => a - t.points, 0);
  return (
    <>
      <PageHeader title="Programa de fidelidade" description="Pontos creditados automaticamente quando o pedido é concluído. O cliente vê os pontos na página do pedido." />
      <LoyaltyManager
        program={program ?? { is_enabled: false, points_per_real: 1, rules_text: "" }}
        rewards={rewards ?? []}
        products={products ?? []}
        top={(top ?? []) as unknown as { customer_id: string; points_balance: number; lifetime_points: number; customer: { name: string; phone: string | null } | null }[]}
        stats={{ earned, redeemed }}
      />
    </>
  );
}
