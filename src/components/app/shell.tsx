"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { switchOrgAction } from "@/app/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { NAV, type NavItem } from "@/lib/permissions";
import { daysLeft, trialLabel, trialReminder } from "@/lib/plan-access";
import { primeAudio, setSoundEnabled, soundEnabled } from "@/lib/sound";
import type { StoreStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";
import { CommandPalette } from "./command-palette";
import { NewOrderWatcher } from "./new-order-watcher";
import { NotificationsBell, type NotificationItem } from "./notifications";
import { Shortcuts } from "./shortcuts";
import { StoreToggle } from "./store-toggle";

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

function useVisibleNav() {
  const { can, has } = useApp();
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length).map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, locked: Boolean(i.feature && !has(i.feature)) })),
  }));
}

function NavLink({ item, pathname, badge, onClick }: { item: NavItem & { locked?: boolean }; pathname: string; badge?: number; onClick?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.locked ? `/app/plano?recurso=${item.feature}` : item.href}
      onClick={onClick}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        active ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      <Icon name={item.icon} size={16} className={cn(active ? "text-ember-500" : "text-muted group-hover:text-ink-2")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.locked && <Icon name="lock" size={13} className="text-faint" />}
      {!!badge && <span className="num min-w-5 rounded-sm bg-ember-500 px-1 text-center text-[11px] font-semibold leading-5 text-white">{badge}</span>}
    </Link>
  );
}

function OrgSwitcher() {
  const { org, memberships, roleName } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const multi = memberships.length > 1;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={!multi}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2.5 rounded-md p-1.5 text-left", multi && "hover:bg-sunken")}
      >
        <Avatar name={org.name} src={org.logo_url} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">{org.name}</span>
          <span className="block truncate text-[11px] text-muted">{roleName}</span>
        </span>
        {multi && <Icon name="chevron-down" size={14} className="text-muted" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-pop">
          {memberships.map((m) => (
            <button
              key={m.organization_id}
              type="button"
              onClick={async () => {
                setOpen(false);
                await switchOrgAction(m.organization_id);
                router.push("/app");
                router.refresh();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-sunken"
            >
              <Avatar name={m.name} size={22} />
              <span className="flex-1 truncate">{m.name}</span>
              {m.organization_id === org.id && <Icon name="check" size={14} className="text-ember-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundEnabled());
    primeAudio();
    const h = () => setOn(soundEnabled());
    window.addEventListener("tb-sound-change", h);
    return () => window.removeEventListener("tb-sound-change", h);
  }, []);
  return (
    <button
      type="button"
      onClick={() => setSoundEnabled(!on)}
      aria-label={on ? "Desativar som de novos pedidos" : "Ativar som de novos pedidos"}
      title={on ? "Som de novos pedidos: ligado" : "Som de novos pedidos: desligado"}
      className={cn("grid h-9 w-9 place-items-center rounded-md hover:bg-sunken", on ? "text-ink-2" : "text-faint")}
    >
      <Icon name={on ? "sound-on" : "sound-off"} size={18} />
    </button>
  );
}

function UserMenu() {
  const { user, org } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 hover:bg-sunken" aria-label="Menu do usuário">
        <Avatar name={user.name} size={28} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-pop">
            <div className="border-b border-line px-2.5 py-2">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <a href={`/${org.slug}`} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-sunken">
              <Icon name="external" size={15} /> Ver cardápio online
            </a>
            {user.isPlatformAdmin && (
              <Link href="/master" className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-sunken">
                <Icon name="crown" size={15} /> Painel master
              </Link>
            )}
            <form action={signOutAction}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ketchup-500 hover:bg-ketchup-50">
                <Icon name="logout" size={15} /> Sair
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function TrialBanner() {
  const { subscription, plan, can } = useApp();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  if (plan && plan.trialActive && plan.trialEndsAt) {
    // conta os dias no navegador também (a página pode ficar aberta de um dia para o outro)
    const days = now === null ? plan.trialDaysLeft : daysLeft(plan.trialEndsAt, now);
    if (days <= 0) return null;
    return (
      <div className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-center text-xs text-white">
        <Icon name="sparkle" size={13} className="text-mustard-400" />
        <span><b className="font-semibold">{trialLabel(days)}</b> · Você tem {days} {days === 1 ? "dia restante" : "dias restantes"} com todos os recursos liberados.</span>
        {can("billing.view") && <Link href="/app/configuracoes?tab=assinatura" className="font-semibold text-mustard-400 hover:underline">{plan.planChosen ? "Ver assinatura" : "Escolher plano"}</Link>}
      </div>
    );
  }
  if (!subscription || !can("billing.view")) return null;
  if (subscription.status === "past_due" || subscription.status === "pending") {
    return (
      <div className="bg-ketchup-500 px-4 py-1.5 text-center text-xs text-white">
        Há uma pendência na assinatura. <Link href="/app/configuracoes?tab=assinatura" className="font-semibold underline">Regularizar</Link>
      </div>
    );
  }
  return null;
}

/** Aviso discreto quando faltam 7, 3 ou 1 dia(s) — some ao fechar (até o próximo marco). */
function TrialReminder() {
  const { plan, can } = useApp();
  const [hidden, setHidden] = useState(true);
  const days = plan?.trialActive && plan.trialEndsAt ? daysLeft(plan.trialEndsAt) : 0;
  const tip = plan && !plan.planChosen && can("billing.view") ? trialReminder(days) : null;
  const key = tip ? `tb_trial_tip_${tip.level}` : "";
  useEffect(() => {
    if (!key) return;
    try { setHidden(window.localStorage.getItem(key) === "1"); } catch { setHidden(false); }
  }, [key]);
  if (!tip || hidden) return null;
  return (
    <div className={cn("mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-[13px]",
      tip.level === "last" ? "border-ketchup-500/30 bg-ketchup-50 text-ketchup-700" : tip.level === "warn" ? "border-mustard-500/30 bg-mustard-50 text-mustard-700" : "border-line bg-paper text-muted")}>
      <Icon name="sparkle" size={16} className="mt-0.5 shrink-0" />
      <p className="flex-1">{tip.text} <Link href="/app/configuracoes?tab=assinatura" className="font-semibold text-ink underline">Ver planos</Link></p>
      <button type="button" aria-label="Fechar aviso" className="shrink-0 text-faint hover:text-ink" onClick={() => { setHidden(true); try { window.localStorage.setItem(key, "1"); } catch { /* sem armazenamento */ } }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function AppShell({ children, storeStatus, newOrders, notifications }: { children: ReactNode; storeStatus: StoreStatus | null; newOrders: number; notifications: NotificationItem[] }) {
  const pathname = usePathname();
  const groups = useVisibleNav();
  const { can } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, setPending] = useState(newOrders);
  useEffect(() => setPending(newOrders), [newOrders]);

  const bottom = [
    { href: "/app", label: "Início", icon: "gauge" as const, show: can("dashboard.view") },
    { href: "/app/pedidos", label: "Pedidos", icon: "ticket" as const, show: can("orders.view"), badge: pending },
    { href: "/app/pedidos/novo", label: "Novo", icon: "plus" as const, show: can("orders.create"), primary: true },
    { href: "/app/clientes", label: "Clientes", icon: "users" as const, show: can("customers.view") },
  ].filter((b) => b.show);

  return (
    <div className="min-h-dvh lg:pl-[232px]">
      <NewOrderWatcher onNew={() => setPending((p) => p + 1)} />
      <Shortcuts onPalette={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/app" aria-label="Início">
            <Logo compact />
          </Link>
        </div>
        <div className="px-2.5">
          <OrgSwitcher />
        </div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-2.5 mt-3 flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-line-strong"
        >
          <Icon name="search" size={15} />
          <span className="flex-1 text-left">Buscar…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <nav className="thin-scroll mt-3 flex-1 space-y-4 overflow-y-auto px-2.5 pb-6">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === "/app/pedidos" ? pending : undefined} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <TrialBanner />
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <Link href="/app" className="lg:hidden" aria-label="Início">
            <LogoMark size={28} />
          </Link>
          <div className="min-w-0 flex-1">
            <StoreToggle initial={storeStatus} />
          </div>
          <button type="button" onClick={() => setPaletteOpen(true)} className="grid h-9 w-9 place-items-center rounded-md text-ink-2 hover:bg-sunken lg:hidden" aria-label="Buscar">
            <Icon name="search" size={18} />
          </button>
          {can("orders.create") && (
            <Link href="/app/pedidos/novo" className="hidden h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-[13px] font-medium text-white hover:bg-char-700 sm:inline-flex">
              <Icon name="plus" size={15} /> Novo pedido <span className="ml-1 hidden font-mono text-[11px] text-char-400 xl:inline">N</span>
            </Link>
          )}
          <SoundToggle />
          <NotificationsBell initial={notifications} />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] px-3 pb-28 pt-5 sm:px-5 lg:px-8 lg:pb-12 lg:pt-7 min-[1920px]:max-w-[1760px]"><TrialReminder />{children}</main>

      {/* Navegação inferior (celular) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
          {bottom.map((b) => {
            const active = isActive(pathname, b.href) && !(b.href === "/app/pedidos" && pathname === "/app/pedidos/novo");
            return (
              <Link key={b.href} href={b.href} className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]">
                {b.primary ? (
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-ember-500 text-white shadow-pop">
                    <Icon name="plus" size={20} strokeWidth={2.2} />
                  </span>
                ) : (
                  <>
                    <Icon name={b.icon} size={20} className={active ? "text-ember-500" : "text-muted"} />
                    <span className={active ? "font-medium text-ink" : "text-muted"}>{b.label}</span>
                    {!!b.badge && <span className="num absolute right-[22%] top-2 min-w-4 rounded-full bg-ember-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{b.badge}</span>}
                  </>
                )}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
            <Icon name="more" size={20} />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <div className="space-y-4 p-4">
          <OrgSwitcher />
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{g.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setMoreOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
