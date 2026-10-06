import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding");
  const ctx = await getAuthContext();
  const supabase = await createClient();

  if (!ctx) {
    const { data } = await supabase.auth.getUser();
    const meta = (data.user?.user_metadata ?? {}) as { pending_org_name?: string; pending_org_slug?: string };
    return <OnboardingWizard mode="create" pending={{ name: meta.pending_org_name ?? "", slug: meta.pending_org_slug ?? "" }} />;
  }
  if (!ctx.permissions.has("settings.manage")) redirect("/app");

  const [{ data: hours }, { count: zones }, { count: products }] = await Promise.all([
    supabase.from("opening_hours").select("weekday, opens_at, closes_at").eq("organization_id", ctx.org.id).order("weekday"),
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).is("deleted_at", null),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).is("deleted_at", null),
  ]);

  return (
    <OnboardingWizard
      mode="setup"
      org={ctx.org}
      hours={(hours ?? []).map((h: { weekday: number; opens_at: string; closes_at: string }) => ({ weekday: h.weekday as number, opens_at: String(h.opens_at).slice(0, 5), closes_at: String(h.closes_at).slice(0, 5) }))}
      hasZone={(zones ?? 0) > 0}
      hasProduct={(products ?? 0) > 0}
    />
  );
}
