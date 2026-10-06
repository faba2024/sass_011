"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Permission } from "@/lib/permissions";
import { hasFeature, type PlanAccess } from "@/lib/plan-access";

export interface AppOrg {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  primary_color: string;
}
export interface AppContextValue {
  org: AppOrg;
  user: { id: string; name: string; email: string; isPlatformAdmin: boolean };
  roleKey: string;
  roleName: string;
  permissions: string[];
  features: string[];
  plan: PlanAccess | null;
  memberships: { organization_id: string; name: string; slug: string; role_name: string }[];
  subscription: { status: string; trial_ends_at: string | null; plan_name: string } | null;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return { ...v, can: (p: Permission) => v.permissions.includes(p), has: (f: string) => (v.plan ? hasFeature(v.plan, f) : v.features.includes(f)) };
}
