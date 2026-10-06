import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALL_NAV_ITEMS, homeFor, type Feature, type Permission } from "@/lib/permissions";
import type { Organization, SubscriptionStatus } from "@/lib/types";
import { effectiveFeatures, fromPlanState, hasFeature as planHasFeature, type PlanAccess } from "@/lib/plan-access";

export const ORG_COOKIE = "tb_org";

export interface Membership {
  organization_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role_key: string;
  role_name: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  memberships: Membership[];
  org: Organization;
  roleKey: string;
  roleName: string;
  permissions: Set<Permission>;
  features: Feature[];
  /** teste grátis + plano contratado (fonte única para liberar recursos) */
  plan: PlanAccess | null;
  subscription: { status: SubscriptionStatus; trial_ends_at: string | null; plan_name: string; plan_code: string } | null;
}

export class ActionError extends Error {}

/** Usuário autenticado (ou null). Cacheado por requisição. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_platform_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? profile?.email ?? "",
    fullName: (profile?.full_name as string | null) ?? data.user.email ?? "",
    isPlatformAdmin: Boolean(profile?.is_platform_admin),
  };
});

/** Contexto completo do painel: organização ativa, papel, permissões e recursos do plano. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("organization_members")
    .select("organization_id, role:roles(key, name), organization:organizations(id, name, slug, logo_url, status, deleted_at)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const memberships: Membership[] = (rows ?? [])
    .filter((r: any) => r.organization && !r.organization.deleted_at)
    .map((r: any) => ({
      organization_id: r.organization_id,
      name: r.organization.name,
      slug: r.organization.slug,
      logo_url: r.organization.logo_url,
      role_key: r.role?.key ?? "",
      role_name: r.role?.name ?? "",
    }))
    .sort((a: Membership, b: Membership) => a.name.localeCompare(b.name));

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ORG_COOKIE)?.value;
  let active = memberships.find((m) => m.organization_id === wanted) ?? memberships[0];

  // Admin da plataforma pode abrir o painel de qualquer empresa (suporte)
  let orgId = active?.organization_id;
  if (user.isPlatformAdmin && wanted && !memberships.some((m) => m.organization_id === wanted)) orgId = wanted;
  if (!orgId) return null;

  const [{ data: org }, { data: perms }, { data: state, error: stateError }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    supabase.rpc("my_permissions", { p_org: orgId }),
    supabase.rpc("org_plan_state", { p_org: orgId }),
  ]);
  if (!org) return null;
  let plan = fromPlanState(state as Record<string, unknown> | null);
  if (stateError) plan = await legacyPlanState(orgId); // banco ainda sem a migration 0010
  if (!active) {
    active = { organization_id: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url, role_key: "owner", role_name: "Admin da plataforma" };
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships,
    org: org as Organization,
    roleKey: active.role_key,
    roleName: active.role_name,
    permissions: new Set((perms as Permission[] | null) ?? []),
    features: effectiveFeatures(plan),
    plan,
    subscription: plan
      ? { status: plan.status as SubscriptionStatus, trial_ends_at: plan.trialEndsAt, plan_name: plan.planName, plan_code: plan.planCode }
      : null,
  };
});

/** Compatibilidade: banco sem org_plan_state (migration 0010 ainda não aplicada). */
async function legacyPlanState(orgId: string): Promise<PlanAccess | null> {
  const supabase = await createClient();
  const { data: sub } = await supabase.from("subscriptions").select("status, trial_ends_at, plan:plans(name, code, features)").eq("organization_id", orgId).maybeSingle();
  if (!sub) return null;
  const p = (sub as any).plan ?? {};
  const ends = (sub.trial_ends_at as string | null) ?? null;
  const trial = sub.status === "trialing" && !!ends && new Date(ends).getTime() > Date.now();
  return {
    trialActive: trial, trialEndsAt: ends, trialDaysLeft: trial ? Math.max(1, Math.ceil((new Date(ends!).getTime() - Date.now()) / 86_400_000)) : 0,
    planCode: p.code ?? "", planName: p.name ?? "", planFeatures: p.features ?? [], planChosen: sub.status === "active", needsPlan: false, status: sub.status as string,
  };
}

/** Para páginas de /app: exige login + empresa. */
export async function requireOrg(): Promise<AuthContext> {
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getAuthContext();
  if (!ctx) redirect(user.isPlatformAdmin ? "/master" : "/onboarding");
  return ctx;
}

/** Ponto único de checagem no servidor: teste ativo primeiro, depois o plano. */
export function hasFeature(ctx: AuthContext, feature?: Feature) {
  return planHasFeature(ctx.plan, feature);
}

/** Para páginas: sem permissão → manda para a tela inicial permitida do usuário. */
export async function requirePage(perm: Permission, feature?: Feature): Promise<AuthContext> {
  const ctx = await requireOrg();
  if (!ctx.permissions.has(perm)) {
    const home = homeFor(ctx.permissions, ctx.features);
    redirect(home === "/app" && perm === "dashboard.view" ? "/app/sem-acesso" : home);
  }
  if (feature && !hasFeature(ctx, feature)) redirect(`/app/plano?recurso=${feature}`);
  return ctx;
}

/** Para Server Actions: lança ActionError (mensagem amigável) em vez de redirecionar. */
export async function requireAction(perm: Permission | Permission[], feature?: Feature): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new ActionError("Sessão expirada. Entre novamente.");
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => ctx.permissions.has(p))) throw new ActionError("Você não tem permissão para esta ação.");
  if (feature && !hasFeature(ctx, feature)) throw new ActionError("Recurso não disponível no seu plano.");
  return ctx;
}

export async function requirePlatformAdmin() {
  const user = await getUser();
  if (!user) redirect("/login?next=/master");
  if (!user.isPlatformAdmin) redirect("/app");
  return user;
}

export function navFor(ctx: AuthContext) {
  return ALL_NAV_ITEMS.filter((i) => ctx.permissions.has(i.perm));
}
