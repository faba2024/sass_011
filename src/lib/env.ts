/**
 * URL base do projeto Supabase: SEMPRE só a origem (https://<ref>.supabase.co).
 * Corrige valores colados com caminho extra (ex.: /rest/v1, /auth/v1), barra final,
 * espaços ou aspas. Se uma chave `sb_*` for colada por engano no campo de URL,
 * retorna vazio para gerar uma mensagem de configuração clara em vez de uma URL inválida.
 */
export function normalizeSupabaseUrl(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
  if (!v || /^sb_(?:publishable|secret)_/i.test(v) || /^eyJ[A-Za-z0-9_-]+\./.test(v)) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!u.hostname || !/^https?:$/.test(u.protocol)) return "";
    return u.origin;
  } catch {
    return "";
  }
}

/** Chave sem espaços/aspas acidentais. */
export function cleanKey(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

/** Aceita as chaves novas sb_publishable_* e as anon JWT legadas. */
export function isPublicSupabaseKey(value: string): boolean {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value) || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function normalizeAppUrl(raw: string | undefined | null): string {
  const v = (raw ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
  if (!v) return "http://localhost:3000";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.origin;
  } catch {
    return "http://localhost:3000";
  }
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: cleanKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  appUrl: normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL),
  rootDomain: (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
};

export function assertSupabaseEnv() {
  if (!env.supabaseUrl) {
    throw new Error(
      "Supabase não configurado: NEXT_PUBLIC_SUPABASE_URL deve ser a URL base do projeto (ex.: https://xxxx.supabase.co), sem /rest/v1 e sem chaves sb_*.",
    );
  }
  if (!env.supabaseAnonKey || !isPublicSupabaseKey(env.supabaseAnonKey)) {
    throw new Error(
      "Supabase não configurado: NEXT_PUBLIC_SUPABASE_ANON_KEY deve receber a chave pública/Publishable (sb_publishable_...) ou a anon JWT legada.",
    );
  }
}

/** URL pública da loja (subdomínio quando configurado, senão /slug). */
export function storeUrl(slug: string, path = "") {
  if (env.rootDomain) {
    const protocol = env.appUrl.startsWith("https") ? "https" : "http";
    return `${protocol}://${slug}.${env.rootDomain}${path}`;
  }
  return `${env.appUrl}/${slug}${path}`;
}
