import type { ReactNode } from "react";
import type { NotificationItem } from "@/components/app/notifications";
import { AppShell } from "@/components/app/shell";
import { ChoosePlanGate } from "@/components/billing/choose-plan-gate";
import type { PlanOption } from "@/components/billing/plan-picker";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StoreStatus } from "@/lib/types";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: status }, { count }, { data: notes }, { data: reads }] = await Promise.all([
    supabase.rpc("store_status", { p_org: ctx.org.id }),
    ctx.permissions.has("orders.view")
      ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).in("status", ["new", "awaiting_confirmation"])
      : Promise.resolve({ count: 0 }),
    supabase.from("notifications").select("id, type, title, body, link, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("notification_reads").select("notification_id").eq("user_id", ctx.userId).eq("organization_id", ctx.org.id),
  ]);
  const readSet = new Set((reads ?? []).map((r: { notification_id: string }) => r.notification_id));
  const notifications: NotificationItem[] = (notes ?? []).map((n: Omit<NotificationItem, "read">) => ({ ...n, read: readSet.has(n.id) }));

  // teste acabou sem plano escolhido: o painel mostra a escolha do plano (dados preservados)
  let gate: PlanOption[] | null = null;
  if (ctx.plan?.needsPlan) {
    const { data: plans } = await supabase.from("plans").select("code, name, price, description, features").eq("is_active", true).order("sort");
    gate = (plans ?? []) as PlanOption[];
  }

  return (
    <AppShell storeStatus={(status as StoreStatus) ?? null} newOrders={count ?? 0} notifications={notifications}>
      {gate ? <ChoosePlanGate plans={gate} canChoose={ctx.permissions.has("billing.view")} /> : children}
    </AppShell>
  );
}
