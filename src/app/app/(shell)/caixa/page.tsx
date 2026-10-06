import { PageHeader } from "@/components/ui/layout";
import { ErrorState } from "@/components/ui/states";
import { requirePage } from "@/lib/auth";
import { getStorefront } from "@/lib/storefront";
import { createClient } from "@/lib/supabase/server";
import { CashRegisterView, type RegisterSummary } from "./cash-register";

export const metadata = { title: "Caixa / PDV" };

export default async function CashPage() {
  const ctx = await requirePage("cash.operate", "caixa");
  const supabase = await createClient();
  const { data: open } = await supabase.from("cash_registers").select("id").eq("organization_id", ctx.org.id).eq("status", "open").maybeSingle();
  const [{ data: history }, summary, moves, sf, { data: tables }] = await Promise.all([
    supabase.from("cash_registers").select("id, opened_at, closed_at, opening_amount, expected_amount, reported_amount, difference, opened_by, closed_by, summary").eq("organization_id", ctx.org.id).eq("status", "closed").order("closed_at", { ascending: false }).limit(20),
    open ? supabase.rpc("cash_register_summary", { p_register: open.id }) : Promise.resolve({ data: null }),
    open ? supabase.from("cash_movements").select("id, type, payment_method, amount, reason, order_id, created_at, created_by").eq("cash_register_id", open.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    getStorefront(ctx.org.slug),
    supabase.from("dining_tables").select("id, label").eq("organization_id", ctx.org.id).eq("is_active", true).is("deleted_at", null).order("sort"),
  ]);
  if (!sf) return <ErrorState description="Cardápio indisponível" />;
  const people = new Set<string>();
  (history ?? []).forEach((h: { opened_by: string; closed_by: string | null }) => { people.add(h.opened_by); if (h.closed_by) people.add(h.closed_by); });
  ((moves.data ?? []) as { created_by: string | null }[]).forEach((m) => m.created_by && people.add(m.created_by));
  const { data: profs } = people.size ? await supabase.from("profiles").select("id, full_name, email").in("id", [...people]) : { data: [] };
  const names = Object.fromEntries((profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p.full_name ?? p.email ?? "—"]));
  return (
    <>
      <PageHeader title="Caixa / PDV" description="Abertura, vendas no balcão, sangria, suprimento e fechamento com conferência." />
      <CashRegisterView
        summary={(summary.data as RegisterSummary | null) ?? null}
        movements={(moves.data ?? []) as { id: string; type: string; payment_method: string; amount: number; reason: string | null; order_id: string | null; created_at: string; created_by: string | null }[]}
        history={(history ?? []) as { id: string; opened_at: string; closed_at: string; opening_amount: number; expected_amount: number; reported_amount: number; difference: number; opened_by: string; closed_by: string | null; summary: RegisterSummary | null }[]}
        names={names}
        sf={sf}
        tables={tables ?? []}
        tz={ctx.org.timezone}
      />
    </>
  );
}
