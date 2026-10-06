import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Renova a sessão do Supabase em cada requisição e devolve o usuário (ou null). */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const url = env.supabaseUrl;
  const key = env.supabaseAnonKey;
  if (!url || !key) return { response, userId: null as string | null };

  let res = response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const rewritten = res.headers.get("x-middleware-rewrite");
        res = rewritten
          ? NextResponse.rewrite(new URL(rewritten), { request })
          : NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return { response: res, userId: data.user?.id ?? null };
}
