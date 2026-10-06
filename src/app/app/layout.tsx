import type { ReactNode } from "react";
import { AppProvider } from "@/components/app/app-context";
import { requireOrg } from "@/lib/auth";

export default async function AppRootLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrg();
  return (
    <AppProvider
      value={{
        org: { id: ctx.org.id, name: ctx.org.name, slug: ctx.org.slug, logo_url: ctx.org.logo_url, timezone: ctx.org.timezone, primary_color: ctx.org.primary_color },
        user: { id: ctx.userId, name: ctx.fullName, email: ctx.email, isPlatformAdmin: ctx.isPlatformAdmin },
        roleKey: ctx.roleKey,
        roleName: ctx.roleName,
        permissions: [...ctx.permissions],
        features: ctx.features,
        plan: ctx.plan,
        memberships: ctx.memberships.map((m) => ({ organization_id: m.organization_id, name: m.name, slug: m.slug, role_name: m.role_name })),
        subscription: ctx.subscription ? { status: ctx.subscription.status, trial_ends_at: ctx.subscription.trial_ends_at, plan_name: ctx.subscription.plan_name } : null,
      }}
    >
      {children}
    </AppProvider>
  );
}
