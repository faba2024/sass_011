import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cleanKey, env } from "@/lib/env";

/**
 * Cliente com SERVICE ROLE — ignora RLS.
 * Uso restrito: criar usuários no Auth (funcionários, empresas pelo master).
 * Nunca importe em componentes de cliente.
 */
export function createAdminClient() {
  const key = cleanKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!env.supabaseUrl || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor (veja SETUP.md).");
  }
  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
