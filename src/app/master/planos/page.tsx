import { PageHeader } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { PlansView, type PlanRow } from "./plans-view";

export const metadata = { title: "Planos" };

export default async function PlansPage() {
  const supabase = await createClient();
  const [{ data: plans }, { data: subs }] = await Promise.all([
    supabase.from("plans").select("id, code, name, description, price, limits, features, is_active, sort").order("sort"),
    supabase.from("subscriptions").select("plan_id, status"),
  ]);
  const counts = new Map<string, number>();
  for (const s of (subs ?? []) as { plan_id: string; status: string }[]) if (s.status === "active" || s.status === "trialing") counts.set(s.plan_id, (counts.get(s.plan_id) ?? 0) + 1);
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Planos" description="Preço, limites e recursos liberados. Alterações valem na hora para todas as empresas do plano." />
      <PlansView plans={((plans ?? []) as PlanRow[]).map((p) => ({ ...p, subscribers: counts.get(p.id) ?? 0 }))} />
    </>
  );
}
