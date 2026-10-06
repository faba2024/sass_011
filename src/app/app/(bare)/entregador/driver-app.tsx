"use client";
import Link from "next/link";
import { useState } from "react";
import { logWhatsappAction, updateStatusAction } from "@/app/app/(shell)/pedidos/actions";
import { useApp } from "@/components/app/app-context";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";
import { whatsappVars } from "@/components/orders/order-detail";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/ui/logo";
import { Icon } from "@/components/ui/icons";
import { useAction } from "@/hooks/use-action";
import { DRIVER_STATUS, ORDER_STATUS, PAYMENT_METHOD } from "@/lib/constants";
import { money, phone, time } from "@/lib/format";
import type { OrderWithItems } from "@/lib/types";
import { cn } from "@/lib/utils";
import { renderTemplate, waLink } from "@/lib/whatsapp";
import { setMyDriverStatusAction } from "./actions";

export function DriverApp({ driver, orders, templates }: { driver: { id: string; name: string; status: "available" | "on_delivery" | "offline"; vehicle: string | null }; orders: OrderWithItems[]; templates: { key: string; body: string }[] }) {
  const { org, can } = useApp();
  const { run, pending } = useAction();
  const [busy, setBusy] = useState<string | null>(null);
  const active = orders.filter((o) => o.status !== "delivered");
  const delivered = orders.filter((o) => o.status === "delivered");
  const tpl = templates.find((t) => t.key === "out_for_delivery");

  const move = async (o: OrderWithItems, to: "out_for_delivery" | "delivered") => {
    setBusy(o.id);
    await run(() => updateStatusAction(o.id, to), { success: to === "delivered" ? `Pedido #${o.number} entregue` : `Saiu para entrega #${o.number}` });
    setBusy(null);
    if (to === "out_for_delivery" && o.customer_phone && tpl) {
      const body = renderTemplate(tpl.body, whatsappVars(o, org.name, org.slug));
      window.open(waLink(o.customer_phone, body), "_blank", "noopener");
      void logWhatsappAction({ orderId: o.id, customerId: o.customer_id, templateKey: tpl.key, phone: o.customer_phone, body });
    }
  };

  return (
    <div className="min-h-dvh bg-paper pb-10">
      <RealtimeRefresh tables={["orders", "drivers"]} debounce={300} />
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Link href={can("orders.view") ? "/app/pedidos" : "/app/entregador"} aria-label="Início"><LogoMark size={28} /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{driver.name}</p>
            <p className="text-xs text-muted">{org.name}{driver.vehicle ? ` · ${driver.vehicle}` : ""}</p>
          </div>
          <Badge tone={DRIVER_STATUS[driver.status].tone} dot>{DRIVER_STATUS[driver.status].label}</Badge>
        </div>
        {driver.status !== "on_delivery" && (
          <div className="mx-auto mt-3 grid max-w-lg grid-cols-2 gap-2">
            {(["available", "offline"] as const).map((s) => (
              <button key={s} type="button" disabled={pending} onClick={() => run(() => setMyDriverStatusAction(s))} className={cn("h-10 rounded-md border text-[13px] font-medium", driver.status === s ? "border-ink bg-ink text-white" : "border-line bg-surface")}>
                {s === "available" ? "Disponível" : "Offline"}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        <h1 className="font-display text-lg font-semibold">Entregas atribuídas <span className="num text-muted">({active.length})</span></h1>
        {active.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <Icon name="bike" size={28} className="mx-auto text-faint" />
            <p className="mt-2 font-medium">Nenhuma entrega no momento</p>
            <p className="text-[13px] text-muted">Quando a loja atribuir um pedido a você, ele aparece aqui na hora.</p>
          </div>
        )}
        {active.map((o) => {
          const addr = o.address;
          const mapsQuery = addr ? encodeURIComponent(`${addr.street}, ${addr.number}, ${addr.district}${addr.city ? `, ${addr.city}` : ""}`) : "";
          const change = o.payment_method === "cash" && o.change_for ? Number(o.change_for) - Number(o.total) : null;
          return (
            <article key={o.id} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="num font-mono text-xl font-bold">#{o.number}</p>
                  <p className="text-xs text-muted">Pedido às {time(o.created_at, org.timezone)}</p>
                </div>
                <Badge tone={ORDER_STATUS[o.status].tone} dot>{ORDER_STATUS[o.status].label}</Badge>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div>
                  <p className="text-[15px] font-semibold">{o.customer_name}</p>
                  {o.customer_phone && <p className="text-[13px] text-muted">{phone(o.customer_phone)}</p>}
                </div>
                {addr && (
                  <div className="rounded-md bg-paper p-3 text-[14px]">
                    <p className="font-medium">{addr.street}, {addr.number}</p>
                    <p className="text-ink-2">{[addr.complement, addr.district].filter(Boolean).join(" · ")}</p>
                    {addr.reference && <p className="mt-1 text-[13px] text-muted">Ref.: {addr.reference}</p>}
                  </div>
                )}
                <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                  <span className="text-[13px] text-ink-2">
                    {PAYMENT_METHOD[o.payment_method]}
                    {o.payment_status === "paid" ? " · já pago" : " · cobrar na entrega"}
                  </span>
                  <span className="num font-display text-lg font-bold">{money(o.total)}</span>
                </div>
                {change != null && change > 0 && <p className="rounded-md bg-mustard-50 px-3 py-2 text-[13px] font-medium text-mustard-700">Levar troco: {money(change)} (para {money(o.change_for)})</p>}
                <p className="text-xs text-muted">{o.order_items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}</p>
              </div>
              <div className="grid grid-cols-3 border-t border-line">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`} target="_blank" rel="noreferrer" className="flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium text-ink-2 hover:bg-sunken"><Icon name="navigation" size={18} />Maps</a>
                <a href={`tel:${o.customer_phone ?? ""}`} className="flex h-14 flex-col items-center justify-center gap-0.5 border-x border-line text-[12px] font-medium text-ink-2 hover:bg-sunken"><Icon name="phone" size={18} />Ligar</a>
                <a href={waLink(o.customer_phone)} target="_blank" rel="noreferrer" className="flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium text-pickle-700 hover:bg-sunken"><Icon name="whatsapp" size={18} />WhatsApp</a>
              </div>
              <div className="border-t border-line p-3">
                {o.status === "ready" && (
                  <button type="button" disabled={busy === o.id} onClick={() => move(o, "out_for_delivery")} className="h-14 w-full rounded-lg bg-ink text-[16px] font-semibold text-white disabled:opacity-50">
                    {busy === o.id ? "…" : "Iniciar entrega"}
                  </button>
                )}
                {o.status === "out_for_delivery" && (
                  <button type="button" disabled={busy === o.id} onClick={() => move(o, "delivered")} className="h-14 w-full rounded-lg bg-pickle-500 text-[16px] font-semibold text-white disabled:opacity-50">
                    {busy === o.id ? "…" : "Entregue"}
                  </button>
                )}
                {(o.status === "confirmed" || o.status === "preparing") && <p className="py-3 text-center text-[13px] text-muted">Aguardando a cozinha finalizar…</p>}
              </div>
            </article>
          );
        })}

        {delivered.length > 0 && (
          <section className="pt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Entregues hoje · {delivered.length}</h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {delivered.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="num font-mono font-semibold">#{o.number}</span>
                  <span className="flex-1 truncate px-3 text-ink-2">{o.customer_name}</span>
                  <span className="text-muted">{time(o.delivered_at, org.timezone)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
