import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Retorno dos links de e-mail do Supabase:
 *  - PKCE (padrão do @supabase/ssr): ?code=...  → exchangeCodeForSession (mesmo navegador do cadastro)
 *  - token_hash (template recomendado no SETUP.md): ?token_hash=...&type=signup|email|recovery → verifyOtp (qualquer navegador)
 * Depois de autenticar, decide o destino: recuperação de senha, onboarding (sem hamburgueria) ou painel.
 */
// verifyOtp com token_hash só aceita tipos de E-MAIL (não "sms"/"phone_change")
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
function isEmailOtpType(t: string | null): t is EmailOtpType {
  return t !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(t);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  if (!env.supabaseUrl || !env.supabaseAnonKey) return NextResponse.redirect(new URL("/login?erro=config", origin));

  // o próprio Supabase manda ?error=...&error_code=otp_expired quando o link é inválido/expirado
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) {
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const type: EmailOtpType | null = isEmailOtpType(rawType) ? rawType : null;
  const nextParam = url.searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error("[auth/callback] exchangeCodeForSession:", error.code ?? error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
    if (error) console.error("[auth/callback] verifyOtp:", error.code ?? error.message);
  }
  if (!ok) {
    // ex.: link aberto em outro navegador (PKCE). A conta pode já estar confirmada: basta entrar.
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }

  if (type === "recovery" || next === "/redefinir-senha") return NextResponse.redirect(new URL("/redefinir-senha", origin));

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return NextResponse.redirect(new URL("/login", origin));
  const { count } = await supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true);
  const destination = count ? (next && next !== "/onboarding" ? next : "/app") : "/onboarding";
  return NextResponse.redirect(new URL(destination, origin));
}
