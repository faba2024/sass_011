import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PlanOption } from "@/components/billing/plan-picker";
import type { PaymentIntegrationStatus } from "./actions";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePage("settings.manage");
  const { tab } = await searchParams;
  const supabase = await createClient();
  const canBilling = ctx.permissions.has("billing.view");
  const [{ data: hours }, { data: exceptions }, { data: sub }, { data: payments }, { data: integration }, { data: plans }] = await Promise.all([
    supabase.from("opening_hours").select("weekday, opens_at, closes_at").eq("organization_id", ctx.org.id).order("weekday").order("opens_at"),
    supabase.from("opening_exceptions").select("id, date, is_closed, opens_at, closes_at, reason").eq("organization_id", ctx.org.id).gte("date", new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order("date"),
    canBilling ? supabase.from("subscriptions").select("status, price, trial_ends_at, current_period_start, current_period_end, plan:plans(name, code, limits, features)").eq("organization_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    canBilling ? supabase.from("subscription_payments").select("id, amount, due_date, status, paid_at, method").eq("organization_id", ctx.org.id).order("due_date", { ascending: false }).limit(24) : Promise.resolve({ data: [] }),
    tab === "pagamentos" ? supabase.rpc("payment_integration_status", { p_org: ctx.org.id }) : Promise.resolve({ data: null }),
    canBilling && tab === "assinatura" ? supabase.from("plans").select("code, name, price, description, features").eq("is_active", true).order("sort") : Promise.resolve({ data: [] }),
  ]);
  return (
    <>
      <PageHeader title="Configurações" description="Dados da loja, aparência do cardápio, horários, pedidos, pagamentos e assinatura." />
      <SettingsView
        tab={tab ?? "loja"}
        org={ctx.org}
        hours={(hours ?? []).map((h: { weekday: number; opens_at: string; closes_at: string }) => ({ weekday: h.weekday, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) }))}
        exceptions={exceptions ?? []}
        subscription={sub as never}
        payments={payments ?? []}
        canBilling={canBilling}
        plans={(plans ?? []) as PlanOption[]}
        access={ctx.plan}
        integration={(integration as PaymentIntegrationStatus | null) ?? { configured: false, is_enabled: false }}
      />
    </>
  );
}
