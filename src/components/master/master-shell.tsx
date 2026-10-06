"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(auth)/actions";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/master", label: "Visão geral", icon: "gauge" },
  { href: "/master/empresas", label: "Empresas", icon: "building" },
  { href: "/master/assinaturas", label: "Assinaturas e faturas", icon: "receipt" },
  { href: "/master/planos", label: "Planos", icon: "layers" },
  { href: "/master/usuarios", label: "Usuários", icon: "users" },
  { href: "/master/configuracoes", label: "Configurações", icon: "settings" },
];

export function MasterShell({ children, user, hasOrg }: { children: ReactNode; user: { name: string; email: string }; hasOrg: boolean }) {
  const path = usePathname();
  const active = (href: string) => (href === "/master" ? path === href : path.startsWith(href));
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-char-800 bg-char-900 text-char-200 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16">
          <Link href="/master" className="flex items-center gap-2"><Logo dark compact /><span className="rounded bg-mustard-400 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-char-900">Master</span></Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Painel master">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors", active(n.href) ? "bg-white/10 text-white" : "text-char-200 hover:bg-white/5 hover:text-white")}>
              <Icon name={n.icon} size={16} />{n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-char-400">{user.email}</p>
          <div className="mt-3 flex gap-2">
            {hasOrg && <Link href="/app" className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10">Meu painel</Link>}
            <form action={signOutAction}><button type="submit" className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10">Sair</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-[1400px]">{children}</div></main>
    </div>
  );
}
