"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateStatusAction } from "@/app/app/(shell)/pedidos/actions";
import { useApp } from "@/components/app/app-context";
import { modLabel } from "@/components/orders/order-items";
import { Icon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { useToast } from "@/components/ui/toast";
import { ORDER_TYPE } from "@/lib/constants";
import { elapsed, minutesSince, time } from "@/lib/format";
import { playChime, primeAudio, setSoundEnabled, soundEnabled } from "@/lib/sound";
import { getBrowserClient } from "@/lib/supabase/client";
import type { OrderWithItems } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getKitchenOrdersAction } from "./actions";

type KOrder = OrderWithItems & { table_label: string | null };
type Filter = "all" | "delivery" | "pickup" | "local";

function urgency(min: number) {
  if (min >= 20) return { bar: "bg-ketchup-500", text: "text-ketchup-100", ring: "ring-ketchup-500/40" };
  if (min >= 10) return { bar: "bg-mustard-500", text: "text-mustard-100", ring: "ring-mustard-500/30" };
  return { bar: "bg-pickle-500", text: "text-pickle-100", ring: "ring-transparent" };
}

export function KitchenDisplay({ initial }: { initial: KOrder[] }) {
  const { org, can } = useApp();
  const toast = useToast();
  const [orders, setOrders] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [sound, setSound] = useState(true);
  const [full, setFull] = useState(false);
  const known = useRef(new Set(initial.map((o) => o.id)));

  const reload = useCallback(async () => {
    const res = await getKitchenOrdersAction();
    if (!res.ok || !res.data) return;
    const newOnes = res.data.filter((o) => !known.current.has(o.id) && o.status === "confirmed");
    res.data.forEach((o) => known.current.add(o.id));
    if (newOnes.length) playChime(1);
    setOrders(res.data);
  }, []);

  useEffect(() => {
    setSound(soundEnabled());
    primeAudio();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearInterval(t);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`kds-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `organization_id=eq.${org.id}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void reload(), 200);
      })
      .subscribe();
    const poll = setInterval(() => void reload(), 30_000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [org.id, reload]);

  const move = async (o: KOrder, to: "preparing" | "ready") => {
    setBusy(o.id);
    const res = await updateStatusAction(o.id, to);
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    setOrders((l) => l.map((x) => (x.id === o.id ? { ...x, status: to, ready_at: to === "ready" ? new Date().toISOString() : x.ready_at } : x)));
  };

  const match = (o: KOrder) =>
    filter === "all" || (filter === "delivery" && o.type === "delivery") || (filter === "pickup" && o.type === "pickup") || (filter === "local" && (o.type === "dine_in" || o.type === "counter"));
  const active = orders.filter((o) => (o.status === "confirmed" || o.status === "preparing") && match(o));
  const ready = orders.filter((o) => o.status === "ready" && match(o)).sort((a, b) => (b.ready_at ?? "").localeCompare(a.ready_at ?? ""));
  const todo = active.filter((o) => o.status === "confirmed").length;
  const cooking = active.filter((o) => o.status === "preparing").length;

  return (
    <div className="min-h-dvh bg-char-900 text-white">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-char-700 bg-char-950/95 px-4 py-2.5 backdrop-blur">
        <Link href={can("orders.view") ? "/app/pedidos" : "/app"} className="flex items-center gap-2" aria-label="Voltar ao painel">
          <LogoMark size={26} />
          <span className="hidden font-display text-[15px] font-semibold sm:inline">Cozinha · {org.name}</span>
        </Link>
        <div className="ml-2 flex items-center gap-4 text-[13px]">
          <span><b className="num text-lg">{todo}</b> <span className="text-char-400">a fazer</span></span>
          <span><b className="num text-lg text-mustard-400">{cooking}</b> <span className="text-char-400">na chapa</span></span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden rounded-md bg-char-800 p-0.5 sm:flex">
            {([["all", "Todos"], ["delivery", "Entrega"], ["pickup", "Retirada"], ["local", "Local"]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={cn("h-8 rounded-[5px] px-3 text-[13px] font-medium", filter === k ? "bg-char-600 text-white" : "text-char-400 hover:text-white")}>{label}</button>
            ))}
          </div>
          <span className="num hidden px-2 font-mono text-lg font-semibold md:inline">{new Date(now).toLocaleTimeString("pt-BR", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit" })}</span>
          <button type="button" onClick={() => { setSoundEnabled(!sound); setSound(!sound); }} className="grid h-9 w-9 place-items-center rounded-md text-char-200 hover:bg-char-800" aria-label="Som">
            <Icon name={sound ? "sound-on" : "sound-off"} size={18} />
          </button>
          <button type="button" onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)} className="grid h-9 w-9 place-items-center rounded-md text-char-200 hover:bg-char-800" aria-label="Tela cheia">
            <Icon name={full ? "minimize" : "maximize"} size={18} />
          </button>
        </div>
      </header>

      <div className="scroll-x flex gap-1 px-4 pt-3 sm:hidden">
        {([["all", "Todos"], ["delivery", "Entrega"], ["pickup", "Retirada"], ["local", "Local"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={cn("h-8 shrink-0 rounded-md px-3 text-[13px] font-medium", filter === k ? "bg-char-600" : "bg-char-800 text-char-400")}>{label}</button>
        ))}
      </div>

      <main className="p-3 sm:p-4">
        {active.length === 0 ? (
          <div className="grid min-h-[50dvh] place-items-center text-center">
            <div>
              <Icon name="flame" size={40} className="mx-auto text-char-600" />
              <p className="mt-3 font-display text-xl font-semibold text-char-200">Chapa livre</p>
              <p className="mt-1 text-sm text-char-400">Pedidos confirmados aparecem aqui automaticamente.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1920px]:grid-cols-5 min-[2560px]:grid-cols-6">
            {active.map((o) => {
              const since = o.status === "preparing" ? (o.preparing_at ?? o.confirmed_at ?? o.created_at) : (o.confirmed_at ?? o.created_at);
              const mins = minutesSince(o.confirmed_at ?? o.created_at, now);
              const u = urgency(mins);
              return (
                <article key={o.id} className={cn("flex animate-ticket-in flex-col overflow-hidden rounded-lg bg-[#fffdf8] text-ink shadow-pop ring-4", u.ring)}>
                  <div className={cn("h-1.5", u.bar)} />
                  <header className="flex items-start justify-between gap-2 px-4 pb-2 pt-3">
                    <div>
                      <p className="num font-mono text-[28px] font-bold leading-none">#{o.number}</p>
                      <p className="mt-1 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
                        {o.table_label ?? ORDER_TYPE[o.type].short}
                        {o.customer_name && <span className="font-normal normal-case text-muted"> · {o.customer_name.split(" ")[0]}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("num font-mono text-[22px] font-bold leading-none", mins >= 20 ? "text-ketchup-500" : mins >= 10 ? "text-mustard-700" : "text-pickle-700")}>{elapsed(since, now)}</p>
                      <p className="mt-1 text-[11px] text-muted">{o.status === "preparing" ? "na chapa" : `entrou ${time(o.confirmed_at ?? o.created_at, org.timezone)}`}</p>
                    </div>
                  </header>
                  <div className="rule-dashed mx-4" />
                  <ul className="flex-1 space-y-2.5 px-4 py-3">
                    {o.order_items.map((it) => {
                      const k = `${o.id}:${it.id}`;
                      return (
                        <li key={it.id}>
                          <button type="button" onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))} className={cn("w-full text-left", done[k] && "opacity-35 line-through")}>
                            <p className="text-[17px] font-bold uppercase leading-tight">
                              <span className="num mr-1.5 font-mono">{it.quantity}x</span>
                              {it.product_name}
                            </p>
                            {it.order_item_modifiers.length > 0 && (
                              <ul className="mt-0.5 space-y-0.5 pl-7 text-[15px] font-semibold uppercase leading-snug">
                                {it.order_item_modifiers.map((m) => (
                                  <li key={m.id} className={cn(m.group_kind === "removal" ? "text-ketchup-500" : m.group_kind === "addon" ? "text-ember-600" : "text-ink-2")}>
                                    {m.group_kind === "removal" || m.group_kind === "addon" ? "" : "· "}
                                    {modLabel(m)}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {it.notes && <p className="mt-1 ml-7 rounded-sm bg-mustard-100 px-1.5 py-0.5 text-[14px] font-semibold text-mustard-700">{it.notes}</p>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {o.notes && (
                    <div className="mx-4 mb-3 rounded-md border-2 border-dashed border-mustard-400 bg-mustard-50 px-3 py-2 text-[14px] font-semibold text-mustard-700">
                      OBS: {o.notes}
                    </div>
                  )}
                  <footer className="border-t border-line p-2">
                    {o.status === "confirmed" ? (
                      <button type="button" disabled={busy === o.id} onClick={() => move(o, "preparing")} className="h-14 w-full rounded-md bg-ink text-[17px] font-bold uppercase tracking-wide text-white hover:bg-char-700 disabled:opacity-50">
                        {busy === o.id ? "…" : "Iniciar preparo"}
                      </button>
                    ) : (
                      <button type="button" disabled={busy === o.id} onClick={() => move(o, "ready")} className="h-14 w-full rounded-md bg-pickle-500 text-[17px] font-bold uppercase tracking-wide text-white hover:bg-pickle-700 disabled:opacity-50">
                        {busy === o.id ? "…" : "Pronto"}
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        {ready.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-char-400">Prontos (últimos 20 min)</h2>
            <div className="scroll-x flex gap-2">
              {ready.map((o) => (
                <div key={o.id} className="shrink-0 rounded-md border border-char-700 bg-char-800 px-3 py-2">
                  <span className="num font-mono text-lg font-bold">#{o.number}</span>
                  <span className="ml-2 text-xs text-char-400">{o.table_label ?? ORDER_TYPE[o.type].short} · {time(o.ready_at, org.timezone)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
