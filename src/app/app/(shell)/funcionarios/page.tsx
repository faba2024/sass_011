import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StaffManager, type Member, type Role } from "./staff-manager";

export const metadata = { title: "Funcionários" };

export default async function StaffPage() {
  const ctx = await requirePage("staff.manage");
  const supabase = await createClient();
  const [{ data: members }, { data: roles }, { data: perms }, { data: audit }, { data: plan }] = await Promise.all([
    supabase.from("organization_members").select("id, user_id, display_name, phone, is_active, last_access_at, created_at, role_id").eq("organization_id", ctx.org.id).order("created_at"),
    supabase.from("roles").select("id, key, name, is_system, role_permissions(permission_key)").eq("organization_id", ctx.org.id).order("created_at"),
    supabase.from("permissions").select("key, module, label, sort").order("sort"),
    supabase.from("audit_logs").select("id, user_id, action, entity, entity_id, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(60),
    supabase.rpc("plan_limit", { p_org: ctx.org.id, p_key: "max_members" }),
  ]);
  const userIds = [...new Set([...(members ?? []).map((m: { user_id: string }) => m.user_id), ...(audit ?? []).map((a: { user_id: string | null }) => a.user_id).filter(Boolean)])] as string[];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds) : { data: [] };
  const byId = Object.fromEntries((profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]));
  return (
    <>
      <PageHeader title="Funcionários e permissões" description="Cada função enxerga só o que precisa. Ex.: cozinha não vê financeiro; caixa não altera configurações." />
      <StaffManager
        members={(members ?? []).map((m: Omit<Member, "email" | "full_name">) => ({ ...m, email: byId[m.user_id]?.email ?? "", full_name: byId[m.user_id]?.full_name ?? "" }))}
        roles={(roles ?? []) as Role[]}
        permissions={(perms ?? []) as { key: string; module: string; label: string }[]}
        audit={(audit ?? []).map((a: { id: string; user_id: string | null; action: string; entity: string; entity_id: string | null; created_at: string }) => ({ ...a, who: a.user_id ? byId[a.user_id]?.full_name ?? byId[a.user_id]?.email ?? "—" : "Sistema" }))}
        me={ctx.userId}
        myRole={ctx.roleKey}
        limit={(plan as number | null) ?? null}
        tz={ctx.org.timezone}
      />
    </>
  );
}
