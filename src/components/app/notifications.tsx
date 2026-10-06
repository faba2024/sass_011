"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markNotificationsReadAction } from "@/app/app/actions";
import { Icon, type IconName } from "@/components/ui/icons";
import { relative } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

export interface NotificationItem {
  id: string;
  type: "new_order" | "low_stock" | "subscription" | "review" | "system";
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
}

const ICON: Record<NotificationItem["type"], IconName> = { new_order: "ticket", low_stock: "boxes", subscription: "crown", review: "star", system: "info" };
const TONE: Record<NotificationItem["type"], string> = {
  new_order: "bg-ember-50 text-ember-600",
  low_stock: "bg-mustard-50 text-mustard-700",
  subscription: "bg-grape-50 text-grape-700",
  review: "bg-pickle-50 text-pickle-700",
  system: "bg-sunken text-ink-2",
};

export function NotificationsBell({ initial }: { initial: NotificationItem[] }) {
  const { org } = useApp();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | NotificationItem["type"]>("all");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setItems(initial), [initial]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications-${org.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `organization_id=eq.${org.id}` }, (payload) => {
        const n = payload.new as Omit<NotificationItem, "read">;
        setItems((l) => [{ ...n, read: false }, ...l.filter((x) => x.id !== n.id)].slice(0, 30));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [org.id]);

  useEffect(() => {
    if (!open) return;
    const h = (e: globalThis.MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const unread = items.filter((i) => !i.read);
  const visible = filter === "all" ? items : items.filter((i) => i.type === filter);
  const markAll = async () => {
    const ids = unread.map((i) => i.id);
    setItems((l) => l.map((i) => ({ ...i, read: true })));
    await markNotificationsReadAction(ids);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative grid h-9 w-9 place-items-center rounded-md text-ink-2 hover:bg-sunken" aria-label={`Notificações${unread.length ? ` (${unread.length} novas)` : ""}`}>
        <Icon name="bell" size={18} />
        {unread.length > 0 && <span className="num absolute right-1 top-1 min-w-4 rounded-full bg-ember-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-14 z-50 animate-pop-in rounded-lg border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="font-display text-sm font-semibold">Notificações</p>
            <button type="button" disabled={!unread.length} onClick={markAll} className="text-xs font-medium text-ember-600 hover:underline disabled:text-faint disabled:no-underline">
              Marcar todas como lidas
            </button>
          </div>
          <div className="scroll-x flex gap-1 border-b border-line px-2.5 py-2">
            {(
              [
                ["all", "Todas"],
                ["new_order", "Pedidos"],
                ["low_stock", "Estoque"],
                ["review", "Avaliações"],
                ["subscription", "Assinatura"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={cn("shrink-0 rounded-sm px-2 py-1 text-xs", filter === k ? "bg-ink text-white" : "text-muted hover:bg-sunken")}>
                {label}
              </button>
            ))}
          </div>
          <div className="thin-scroll max-h-[60dvh] overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-muted">Nada por aqui.</p>
            ) : (
              visible.map((n) => {
                const content = (
                  <div className={cn("flex gap-3 px-3.5 py-3 hover:bg-paper", !n.read && "bg-ember-50/40")}>
                    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", TONE[n.type])}>
                      <Icon name={ICON[n.type]} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-faint">{relative(n.created_at)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember-500" />}
                  </div>
                );
                const onClick = () => {
                  setOpen(false);
                  if (!n.read) {
                    setItems((l) => l.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
                    void markNotificationsReadAction([n.id]);
                  }
                };
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={onClick} className="block border-b border-line last:border-0">
                    {content}
                  </Link>
                ) : (
                  <button key={n.id} type="button" onClick={onClick} className="block w-full border-b border-line text-left last:border-0">
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
