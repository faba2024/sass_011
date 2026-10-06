"use client";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { NEXT_LABEL, ORDER_TYPE, PAYMENT_METHOD, nextStatus } from "@/lib/constants";
import { minutesSince, money, time } from "@/lib/format";
import type { OrderWithItems } from "@/lib/types";
import { cn } from "@/lib/utils";
import { itemsSummary } from "./order-items";

function waitTone(min: number) {
  if (min >= 30) return "text-ketchup-500";
  if (min >= 15) return "text-mustard-700";
  return "text-pickle-700";
}

export function OrderCard({ order, now, tz, fresh, busy, onOpen, onAdvance, canManage }: { order: OrderWithItems; now: number; tz: string; fresh?: boolean; busy?: boolean; onOpen: () => void; onAdvance: () => void; canManage: boolean }) {
  const waiting = minutesSince(order.created_at, now);
  const next = nextStatus(order.status, order.type);
  const pixPending = order.payment_method === "pix" && order.payment_status !== "paid";
  return (
    <article
      className={cn(
        "group rounded-lg border bg-surface shadow-card transition-shadow hover:shadow-pop",
        fresh ? "animate-ticket-in border-ember-400 ring-2 ring-ember-500/20" : "border-line",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full px-3 pb-2 pt-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="num font-mono text-[15px] font-bold">#{order.number}</span>
          {fresh && <span className="rounded-sm bg-ember-500 px-1 text-[10px] font-bold uppercase text-white">novo</span>}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            <Icon name="clock" size={12} />
            {time(order.created_at, tz)}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] font-medium">{order.customer_name ?? "Cliente"}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{itemsSummary(order.order_items)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Badge tone={order.type === "delivery" ? "violet" : order.type === "pickup" ? "blue" : "neutral"}>{ORDER_TYPE[order.type].short}</Badge>
          {order.scheduled_for && <Badge tone="mustard">Agendado {time(order.scheduled_for, tz)}</Badge>}
          {pixPending && <Badge tone="mustard">Pix pendente</Badge>}
          {order.notes && <Badge tone="neutral">Obs.</Badge>}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2 text-xs">
          <span className={cn("num flex items-center gap-1 font-semibold", order.status === "delivered" || order.status === "cancelled" ? "text-muted" : waitTone(waiting))}>
            <Icon name="timer" size={13} />
            {waiting} min
          </span>
          <span className="text-muted">{PAYMENT_METHOD[order.payment_method]}</span>
          <span className="num font-semibold text-ink">{money(order.total)}</span>
        </div>
      </button>
      {canManage && next && (
        <div className="flex gap-1.5 px-2 pb-2">
          <button type="button" onClick={onOpen} className="h-8 flex-1 rounded-md border border-line text-xs font-medium text-ink-2 hover:bg-sunken">
            Ver pedido
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAdvance}
            className={cn(
              "h-8 flex-[1.4] rounded-md text-xs font-semibold text-white disabled:opacity-60",
              order.status === "new" || order.status === "awaiting_confirmation" ? "bg-ember-500 hover:bg-ember-600" : "bg-ink hover:bg-char-700",
            )}
          >
            {busy ? "…" : NEXT_LABEL[next]}
          </button>
        </div>
      )}
    </article>
  );
}
