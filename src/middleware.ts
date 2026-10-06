import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { env } from "@/lib/env";

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
const APP_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
})();
const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "master", "api"]);
const PROTECTED = ["/app", "/master", "/onboarding"];

// Cache em memória (por instância edge) para domínios próprios
const domainCache = new Map<string, { slug: string | null; at: number }>();

async function resolveCustomDomain(host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.slug;
  const url = env.supabaseUrl; // só a origem; o caminho REST é montado uma única vez abaixo
  const key = env.supabaseAnonKey;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/resolve_domain`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_host: host }),
    });
    const slug = res.ok ? ((await res.json()) as string | null) : null;
    domainCache.set(host, { slug, at: Date.now() });
    return slug;
  } catch {
    return null;
  }
}

function isPlatformHost(host: string) {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IP (ex.: testar no celular pela rede local)
  if (APP_HOST && host === APP_HOST) return true;
  if (ROOT_DOMAIN && (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`)) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // 1) Resolve a loja pelo host (subdomínio ou domínio próprio) → reescreve para /[slug]
  let storeSlug: string | null = null;
  if (ROOT_DOMAIN && host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
    if (sub && !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub)) storeSlug = sub;
  } else if (host && !isPlatformHost(host)) {
    storeSlug = await resolveCustomDomain(host);
  }

  let response: NextResponse;
  if (storeSlug && !pathname.startsWith(`/${storeSlug}`) && !pathname.startsWith("/api") && !pathname.startsWith("/auth")) {
    const target = request.nextUrl.clone();
    target.pathname = `/${storeSlug}${pathname === "/" ? "" : pathname}`;
    response = NextResponse.rewrite(target, { request });
  } else {
    response = NextResponse.next({ request });
  }

  // 2) Sessão Supabase (renova cookies) + proteção de rotas privadas
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const { response: res, userId } = await updateSession(request, response);
  if (needsAuth && !userId) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|demo/|sounds/|robots.txt|sitemap.xml).*)"],
};
