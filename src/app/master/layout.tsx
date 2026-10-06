import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MasterShell } from "@/components/master/master-shell";
import { getAuthContext, requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Master", template: "%s · Master · TOP BURGER OS" } };

export default async function MasterLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformAdmin();
  const ctx = await getAuthContext();
  return <MasterShell user={{ name: user.fullName, email: user.email }} hasOrg={Boolean(ctx)}>{children}</MasterShell>;
}
