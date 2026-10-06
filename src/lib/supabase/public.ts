import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, assertSupabaseEnv } from "@/lib/env";

/** Cliente anônimo sem cookies — para RPCs públicas do cardápio (cacheável, sem sessão). */
export function createPublicClient() {
  assertSupabaseEnv();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
