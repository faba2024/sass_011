import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const LINK_ERRORS: Record<string, string> = {
  link: "O link de confirmação é inválido ou expirou. Entre com sua senha ou reenvie a confirmação.",
  config: "O sistema de login não está configurado (variáveis do Supabase ausentes). Veja o SETUP.md.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; email?: string; erro?: string }> }) {
  const sp = await searchParams;
  // já autenticado → não mostra o login de novo
  const user = await getUser().catch(() => null);
  if (user) redirect(user.isPlatformAdmin && !sp.next ? "/master" : sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app");
  return <LoginForm next={sp.next} reset={sp.reset === "1"} initialEmail={sp.email} notice={sp.erro ? LINK_ERRORS[sp.erro] ?? LINK_ERRORS.link : null} />;
}
