"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBoardAction, updateStatusAction } from "@/app/app/(shell)/pedidos/actions";
import { useApp } from "@/components/app/app-context";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { KANBAN, ORDER_STATUS, nextStatus } from "@/lib/constants";
import { money } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import type { OrderWithItems } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OrderCard } from "./order-card";
import { OrderDetail } from "./order-detail";

export function KanbanBoard({ initial }: { initial: OrderWithItems[] }) {
  const { org, can } = useApp();
  const toast = useToast();
  const [orders, setOrders] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mobileCol, setMobileCol] = useState(KANBAN[0].key);
  const [connected, setConnected] = useState(true);
  const known = useRef(new Set(initial.map((o) => o.id)));

  const reload = useCallback(async () => {
    const res = await getBoardAction();
    if (!res.ok || !res.data) return;
    const incoming = res.data.filter((o) => !known.current.has(o.id));
    incoming.forEach((o) => known.current.add(o.id));
    if (incoming.length) {
      setFresh((f) => new Set([...f, ...incoming.map((o) => o.id)]));
      setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !incoming.some((o) => o.id === id)))), 60_000);
    }
    setOrders(res.data);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: qualquer mudança em pedidos da loja recarrega o quadro
  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`board-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `organization_id=eq.${org.id}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void reload(), 250);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    // segurança: revalida a cada 45 s caso a conexão em tempo real caia
    const poll = setInterval(() => void reload(), 45_000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [org.id, reload]);

  const advance = async (o: OrderWithItems) => {
    const to = nextStatus(o.status, o.type);
    if (!to) return;
    setBusy(o.id);
    const res = await updateStatusAction(o.id, to);
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    setFresh((f) => {
      const n = new Set(f);
      n.delete(o.id);
      return n;
    });
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, status: to } : x)));
    toast.success(`#${o.number} → ${ORDER_STATUS[to].label}`);
  };

  const done = orders.filter((o) => o.status === "delivered" || o.status === "cancelled").reverse().slice(0, 30);
  const manage = can("orders.manage");

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <span className={cn("h-2 w-2 rounded-full", connected ? "bg-pickle-500" : "bg-mustard-500")} />
        {connected ? "Recebendo pedidos em tempo real" : "Reconectando… atualizando a cada 45 s"}
      </div>

      {/* Abas de coluna no celular */}
      <div className="scroll-x -mx-3 mb-3 flex gap-1.5 px-3 md:hidden">
        {KANBAN.map((c) => {
          const n = orders.filter((o) => c.statuses.includes(o.status)).length;
          return (
            <button key={c.key} type="button" onClick={() => setMobileCol(c.key)} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium", mobileCol === c.key ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2")}>
              {c.label}
              <span className="num text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {KANBAN.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status));
          return (
            <section key={col.key} className={cn("min-w-0 flex-col rounded-xl bg-sunken/70 p-2", mobileCol === col.key ? "flex" : "hidden md:flex")}>
              <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                  {col.label}
                  <span className="num rounded-sm bg-surface px-1.5 text-xs text-muted ring-1 ring-line">{list.length}</span>
                </h2>
                <span className="num text-[11px] text-muted">{money(list.reduce((a, o) => a + Number(o.total), 0))}</span>
              </header>
              <div className="flex min-h-[120px] flex-col gap-2">
                {list.length === 0 ? (
                  <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-line-strong py-8 text-xs text-faint">Nenhum pedido</p>
                ) : (
                  list.map((o) => (
                    <OrderCard key={o.id} order={o} now={now} tz={org.timezone} fresh={fresh.has(o.id) || o.status === "new"} busy={busy === o.id} canManage={manage || (can("kitchen.view") && ["confirmed", "preparing"].includes(o.status))} onOpen={() => setOpenId(o.id)} onAdvance={() => advance(o)} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <details className="mt-6 rounded-lg border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium">
            <Icon name="history" size={16} className="text-muted" /> Finalizados recentemente <span className="num text-muted">({done.length})</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {done.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpenId(o.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-paper">
                  <span className="num w-14 font-mono font-semibold">#{o.number}</span>
                  <span className="flex-1 truncate">{o.customer_name}</span>
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].short}</Badge>
                  <span className="num w-20 text-right">{money(o.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sheet open={Boolean(openId)} onClose={() => setOpenId(null)} width="lg" title="Pedido">
        {openId && <OrderDetail orderId={openId} compact onChanged={reload} />}
      </Sheet>
    </>
  );
}
