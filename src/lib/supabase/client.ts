"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Cliente Supabase no navegador (singleton). Usa a sessão do cookie → RLS e Realtime por usuário. */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
