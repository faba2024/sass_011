import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, assertSupabaseEnv } from "@/lib/env";

/** Cliente Supabase com a sessão do usuário (RLS aplicada). Use em Server Components e Server Actions. */
export async function createClient() {
  // cookies() primeiro: marca a rota como dinâmica (nunca pré-renderizada no build)
  const cookieStore = await cookies();
  assertSupabaseEnv();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de Server Component: o middleware renova a sessão.
        }
      },
    },
  });
}
