"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run, fail } from "@/lib/action";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});

/** Traduz os erros do Supabase Auth (por código, não por texto) em mensagens claras. */
function authMessage(error: { code?: string; message?: string; status?: number } | null | undefined): { code: string; message: string } {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "email_not_confirmed" || /not confirmed/i.test(msg))
    return { code: "email_not_confirmed", message: "Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou reenvie a confirmação abaixo." };
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
    return { code: "invalid_credentials", message: "E-mail ou senha incorretos. Se ainda não tem conta, crie uma em “Teste grátis”." };
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error?.status === 429 || /rate limit|security purposes/i.test(msg))
    return { code: "rate_limit", message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  if (code === "user_banned") return { code, message: "Este acesso está bloqueado. Fale com o suporte." };
  if (code === "email_address_invalid" || /invalid.*email/i.test(msg)) return { code: "email_invalid", message: "Este endereço de e-mail não é aceito. Use outro e-mail." };
  if (code === "weak_password" || /password should/i.test(msg)) return { code: "weak_password", message: "Senha fraca: use pelo menos 8 caracteres, misturando letras e números." };
  if (/invalid path specified|invalid api key|no api key/i.test(msg))
    return { code: "config", message: "Login indisponível: configuração do Supabase inválida no servidor (URL ou chave pública). Confira NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY." };
  if (code === "signup_disabled") return { code, message: "Novos cadastros estão desativados no momento." };
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg) || error?.status === 0)
    return { code: "network", message: "Não foi possível falar com o servidor de login. Verifique a internet e tente de novo." };
  return { code: code || "unknown", message: msg || "Não foi possível concluir. Tente de novo." };
}

function safeNext(next?: string | null, fallback = "/app") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signInAction(input: { email: string; password: string; next?: string }) {
  return run(async () => {
    const data = loginSchema.parse(input);
    const supabase = await createClient();
    const { data: auth, error } = await supabase.auth.signInWithPassword(data).catch((e: Error) => ({ data: { session: null }, error: { message: e.message, status: 0 } as { message: string; status: number; code?: string } }));
    if (error || !auth.session) {
      const m = authMessage(error);
      // o código vai junto para a tela oferecer "reenviar confirmação"
      fail(m.code === "email_not_confirmed" ? `[email_not_confirmed] ${m.message}` : m.message);
    }
    // sem empresa ainda → onboarding (cria a hamburgueria a partir do cadastro)
    const { count } = await supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("user_id", auth.session!.user.id).eq("is_active", true);
    const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", auth.session!.user.id).maybeSingle();
    if (!count) return { next: profile?.is_platform_admin ? "/master" : "/onboarding" };
    return { next: safeNext(input.next) };
  });
}

/** Reenvia o e-mail de confirmação do cadastro (método oficial auth.resend) */
export async function resendConfirmationAction(email: string) {
  return run(async () => {
    const parsed = z.string().trim().toLowerCase().email("Informe um e-mail válido").parse(email);
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: parsed, options: { emailRedirectTo: `${env.appUrl}/auth/callback?next=/onboarding` } });
    if (error) fail(authMessage(error).message);
    return true;
  });
}

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
  storeName: z.string().trim().min(2, "Informe o nome da hamburgueria").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, "Use apenas letras minúsculas, números e hífen"),
});

export async function checkSlugAction(slug: string) {
  return run(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("slug_available", { p_slug: slug });
    if (error) throw error;
    return Boolean(data);
  });
}

export async function signUpAction(input: z.input<typeof signUpSchema>) {
  return run(async () => {
    const data = signUpSchema.parse(input);
    const supabase = await createClient();
    const { data: platform } = await supabase.rpc("platform_public");
    if ((platform as { signup_enabled?: boolean } | null)?.signup_enabled === false) fail("Novos cadastros estão temporariamente fechados. Fale com o suporte.");
    const { data: available } = await supabase.rpc("slug_available", { p_slug: data.slug });
    if (!available) fail("Este endereço já está em uso. Escolha outro.");

    const { data: auth, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${env.appUrl}/auth/callback?next=/onboarding`,
        data: { full_name: data.fullName, pending_org_name: data.storeName, pending_org_slug: data.slug },
      },
    });
    if (error) {
      if (error.code === "user_already_exists" || /registered|exists/i.test(error.message)) fail("Este e-mail já tem conta. Entre com sua senha ou use “Esqueci a senha”.");
      fail(authMessage(error).message);
    }
    if (!auth.user) fail("O servidor de login não confirmou o cadastro. Tente de novo em instantes.");
    // Com confirmação de e-mail ligada, o Supabase NÃO devolve erro para e-mail já cadastrado:
    // devolve um usuário "falso" sem identidades e não envia e-mail nenhum.
    if (!auth.session && (auth.user.identities?.length ?? 0) === 0) {
      fail("Este e-mail já tem conta. Entre com sua senha ou use “Esqueci a senha”.");
    }
    if (!auth.session) return { needsConfirmation: true as const, email: data.email };

    const { error: orgError } = await supabase.rpc("create_my_organization", { p_name: data.storeName, p_slug: data.slug });
    if (orgError) throw orgError;
    return { needsConfirmation: false as const, email: data.email };
  });
}

export async function requestPasswordResetAction(email: string) {
  return run(async () => {
    const parsed = z.string().trim().toLowerCase().email("Informe um e-mail válido").parse(email);
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed, { redirectTo: `${env.appUrl}/auth/callback?next=/redefinir-senha` });
    if (error) fail(authMessage(error).message);
    return true;
  });
}

export async function updatePasswordAction(password: string) {
  return run(async () => {
    const parsed = z.string().min(8, "A senha precisa de pelo menos 8 caracteres").parse(password);
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed });
    if (error) fail(error.code === "same_password" ? "A nova senha precisa ser diferente da atual." : authMessage(error).message);
    return true;
  });
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
