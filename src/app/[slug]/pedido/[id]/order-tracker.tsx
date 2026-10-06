"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD } from "@/lib/constants";
import { money, time } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import { rpcPublicOrder, rpcSubmitReview } from "@/lib/storefront-client";
import type { OrderStatus, PublicOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";

const MESSAGES: Partial<Record<OrderStatus, string>> = {
  new: "Pedido recebido! A loja vai confirmar em instantes.",
  awaiting_confirmation: "Aguardando a confirmação da loja.",
  confirmed: "Pedido confirmado. Já já vai para a chapa.",
  preparing: "Seu pedido está sendo preparado.",
  ready: "Seu pedido está pronto!",
  out_for_delivery: "Seu pedido saiu para entrega.",
  delivered: "Pedido entregue. Bom apetite!",
  cancelled: "Pedido cancelado.",
};

function steps(o: PublicOrder): { status: OrderStatus; label: string; icon: IconName }[] {
  const base: { status: OrderStatus; label: string; icon: IconName }[] = [
    { status: "new", label: "Pedido recebido", icon: "ticket" },
    { status: "confirmed", label: "Pedido confirmado", icon: "check" },
    { status: "preparing", label: "Em preparo", icon: "flame" },
    { status: "ready", label: o.type === "pickup" ? "Pronto para retirada" : "Pronto", icon: "bag" },
  ];
  if (o.type === "delivery") base.push({ status: "out_for_delivery", label: "Saiu para entrega", icon: "bike" });
  base.push({ status: "delivered", label: o.type === "delivery" ? "Entregue" : o.type === "pickup" ? "Retirado" : "Servido", icon: "check-circle" });
  return base;
}
const ORDER: OrderStatus[] = ["new", "awaiting_confirmation", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

export function OrderTracker({ initial, justPlaced, pixCode, pixOnline }: { initial: PublicOrder; justPlaced: boolean; pixCode: string | null; pixOnline: boolean }) {
  const toast = useToast();
  const [o, setO] = useState(initial);
  const [live, setLive] = useState(false);
  const last = useRef(initial.status);

  const refresh = async () => {
    const fresh = await rpcPublicOrder(initial.token);
    if (!fresh) return;
    if (fresh.status !== last.current) {
      last.current = fresh.status;
      toast.info(ORDER_STATUS[fresh.status].customer);
      if ("vibrate" in navigator) navigator.vibrate?.(120);
    }
    setO(fresh);
  };

  useEffect(() => {
    const supabase = getBrowserClient();
    // Realtime Broadcast publicado pelo banco a cada mudança de status (tópico pelo token do pedido)
    const channel = supabase
      .channel(`order:${initial.token}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "status" }, () => void refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(() => void refresh(), 20_000);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.token]);

  const st = steps(o);
  const idx = ORDER.indexOf(o.status === "awaiting_confirmation" ? "new" : o.status);
  const reachedAt = (s: OrderStatus) => o.history.find((h) => h.status === s)?.at;
  const cancelled = o.status === "cancelled";
  const finished = o.status === "delivered";
  const eta = o.eta_min ? `${o.eta_min}–${o.eta_max} min` : null;
  const etaClock = o.eta_max ? new Date(new Date(o.scheduled_for ?? o.created_at).getTime() + o.eta_max * 60000) : null;

  return (
    <div className="mx-auto max-w-[620px] pb-16 md:py-6">
      <header className="flex items-center gap-3 px-4 pt-4">
        <Link href={`/${o.org.slug}`} className="flex items-center gap-2 text-[14px] font-semibold">
          <Icon name="arrow-left" size={18} /> {o.org.name}
        </Link>
        <span className={cn("ml-auto flex items-center gap-1.5 text-xs", live ? "text-pickle-700" : "text-muted")}>
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-pickle-500" : "bg-faint")} />
          {live ? "ao vivo" : "atualizando"}
        </span>
      </header>

      {/* Hero */}
      <section className={cn("mx-4 mt-4 overflow-hidden rounded-2xl px-5 py-6", cancelled ? "bg-ketchup-500 text-white" : "bg-brand-2 text-brand-2-ink")}>
        {justPlaced && !cancelled && <p className="text-[13px] font-semibold uppercase tracking-[0.12em] opacity-80">Pedido recebido 🎉</p>}
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <p className="num font-mono text-[40px] font-bold leading-none">#{o.number}</p>
            <p className="mt-2 text-[17px] font-semibold leading-snug">{MESSAGES[o.status]}</p>
            {cancelled && o.cancel_reason && <p className="mt-1 text-[14px] opacity-90">Motivo: {o.cancel_reason}</p>}
          </div>
        </div>
        {!cancelled && !finished && (
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-current/15 pt-4 text-[14px]">
            <div>
              <p className="text-xs opacity-70">{o.scheduled_for ? "Agendado para" : "Previsão"}</p>
              <p className="num font-semibold">{o.scheduled_for ? time(o.scheduled_for, o.org.timezone) : eta ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">{o.scheduled_for ? "Tipo" : "Chega até"}</p>
              <p className="num font-semibold">{o.scheduled_for ? ORDER_TYPE[o.type].label : etaClock ? time(etaClock, o.org.timezone) : "—"}</p>
            </div>
          </div>
        )}
      </section>

      {/* Pix */}
      {o.payment_method === "pix" && o.payment_status !== "paid" && !cancelled && (
        <section className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <Icon name="pix" size={20} className="text-pickle-500" />
            <h2 className="font-display text-[17px] font-bold">Pague com Pix · {money(o.total)}</h2>
          </div>
          {pixOnline ? (
            <PixOnline token={o.token} total={Number(o.total)} onPaid={() => void refresh()} />
          ) : o.org.pix_key ? (
            <>
              {pixCode && (
                <div className="mt-3">
                  <p className="text-[13px] text-muted">Pix copia e cola</p>
                  <div className="mt-1 flex gap-2">
                    <code className="block min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px]">{pixCode}</code>
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(pixCode); toast.success("Código Pix copiado"); }} className="shrink-0 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white">Copiar</button>
                  </div>
                </div>
              )}
              <p className="mt-3 text-[13px] text-muted">Ou use a chave ({o.org.pix_key_type ?? "chave"}):</p>
              <div className="mt-1 flex gap-2">
                <code className="block min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 font-mono text-[13px]">{o.org.pix_key}</code>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(o.org.pix_key ?? ""); toast.success("Chave copiada"); }} className="shrink-0 rounded-lg border border-ink px-4 text-[13px] font-semibold">Copiar</button>
              </div>
              <p className="mt-2 text-xs text-muted">Favorecido: {o.org.pix_holder_name ?? o.org.name}. A loja confirma o pagamento ao receber — esta tela atualiza sozinha.</p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-ink-2">A loja vai enviar os dados do Pix pelo WhatsApp.</p>
          )}
        </section>
      )}
      {o.payment_status === "paid" && !cancelled && (
        <p className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-pickle-50 px-4 py-3 text-[14px] font-medium text-pickle-700"><Icon name="check-circle" size={18} /> Pagamento confirmado</p>
      )}

      {/* Linha do tempo */}
      {!cancelled && (
        <section className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-5">
          <ol className="relative">
            {st.map((s, i) => {
              const sIdx = ORDER.indexOf(s.status);
              const done = idx >= sIdx;
              const current = done && (i === st.length - 1 || idx < ORDER.indexOf(st[i + 1].status));
              const at = reachedAt(s.status) ?? (s.status === "new" ? o.created_at : undefined);
              return (
                <li key={s.status} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < st.length - 1 && <span className={cn("absolute left-[15px] top-8 h-[calc(100%-24px)] w-0.5", idx > sIdx ? "bg-brand" : "bg-line")} />}
                  <span className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors", done ? "bg-brand text-brand-ink" : "border-2 border-line bg-surface text-faint", current && "ring-4 ring-brand/25")}>
                    <Icon name={done && !current ? "check" : s.icon} size={15} strokeWidth={2.2} />
                  </span>
                  <span className="pt-1">
                    <span className={cn("block text-[15px] leading-tight", done ? "font-semibold text-ink" : "text-muted")}>{s.label}</span>
                    {done && at && <span className="num block text-xs text-muted">{time(at, o.org.timezone)}</span>}
                    {current && !finished && <span className="mt-0.5 block text-xs font-medium text-ember-600">agora</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {finished && <ReviewBox order={o} onDone={refresh} />}

      {/* Resumo */}
      <section className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-[17px] font-bold">Resumo</h2>
        <ul className="mt-3 space-y-2.5 text-[14px]">
          {o.items.map((it) => (
            <li key={it.id} className="flex gap-2">
              <span className="num font-semibold">{it.quantity}x</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{it.name}</span>
                {it.options.length > 0 && <span className="block text-xs text-muted">{it.options.map((op) => (op.group_kind === "addon" ? `+ ${op.name}` : op.name)).join(" · ")}</span>}
                {it.notes && <span className="block text-xs italic text-muted">“{it.notes}”</span>}
              </span>
              <span className="num">{money(it.total)}</span>
            </li>
          ))}
        </ul>
        <div className="rule-dashed my-4" />
        <dl className="space-y-1 text-[14px]">
          <div className="flex justify-between"><dt className="text-muted">Produtos</dt><dd className="num">{money(o.subtotal)}</dd></div>
          {Number(o.delivery_fee) > 0 && <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd className="num">{money(o.delivery_fee)}</dd></div>}
          {Number(o.discount) > 0 && <div className="flex justify-between text-pickle-700"><dt>Desconto{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd className="num">− {money(o.discount)}</dd></div>}
          <div className="flex justify-between pt-1 font-display text-lg font-bold"><dt>Total</dt><dd className="num">{money(o.total)}</dd></div>
        </dl>
        <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
          <p><b>Pagamento:</b> {PAYMENT_METHOD[o.payment_method]}{o.payment_method === "cash" && o.change_for ? ` · troco para ${money(o.change_for)}` : ""}</p>
          <p><b>{ORDER_TYPE[o.type].label}:</b> {o.type === "delivery" && o.address ? `${o.address.street}, ${o.address.number} · ${o.address.district}` : o.type === "pickup" ? o.org.address ?? o.org.name : o.table_label ?? "No local"}</p>
          {o.loyalty_points_earned > 0 && <p className="text-pickle-700"><b>+{o.loyalty_points_earned} pontos</b> de fidelidade</p>}
        </div>
      </section>

      {(o.org.whatsapp || o.org.phone) && (
        <div className="mx-4 mt-4 grid gap-2 sm:grid-cols-2">
          {o.org.whatsapp && (
            <a href={waLink(o.org.whatsapp, `Olá! Sobre meu pedido #${o.number}`)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14px] font-semibold text-pickle-700">
              <Icon name="whatsapp" size={18} /> Falar com a hamburgueria
            </a>
          )}
          <Link href={`/${o.org.slug}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-[14px] font-semibold text-brand-ink">Fazer outro pedido</Link>
        </div>
      )}
    </div>
  );
}

function ReviewBox({ order, onDone }: { order: PublicOrder; onDone: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  if (order.review) {
    return (
      <section className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-[14px] font-semibold">Sua avaliação</p>
        <p className="mt-1 text-mustard-500">{"★".repeat(order.review.rating)}<span className="text-line-strong">{"★".repeat(5 - order.review.rating)}</span></p>
        {order.review.comment && <p className="mt-1 text-[14px] text-ink-2">“{order.review.comment}”</p>}
        {order.review.reply && <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-[13px]"><b>{order.org.name}:</b> {order.review.reply}</p>}
      </section>
    );
  }
  return (
    <section className="mx-4 mt-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-[17px] font-bold">Como foi seu pedido?</h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1">
            <Icon name="star" size={32} className={n <= rating ? "fill-mustard-400 text-mustard-500" : "text-line-strong"} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={600} placeholder="Conte o que achou (opcional)" className="mt-3 w-full resize-none rounded-lg border border-line-strong px-3 py-2 text-[14px] focus:border-brand focus:outline-none" />
      <button
        type="button"
        disabled={!rating || sending}
        onClick={async () => {
          setSending(true);
          const err = await rpcSubmitReview(order.token, rating, comment);
          setSending(false);
          if (err) return toast.error(err);
          toast.success("Obrigado pela avaliação!");
          onDone();
        }}
        className="mt-3 h-11 w-full rounded-xl bg-ink text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {sending ? "Enviando…" : "Enviar avaliação"}
      </button>
    </section>
  );
}

type Charge = { status: string; qr_code: string | null; qr_code_base64: string | null; expires_at: string | null; amount: number };

/** Pix dinâmico (Mercado Pago): QR gerado no servidor e confirmação automática */
function PixOnline({ token, total, onPaid }: { token: string; total: number; onPaid: () => void }) {
  const toast = useToast();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagamentos/pix/${token}`, { method: "POST" });
      const j = (await res.json()) as { online?: boolean; paid?: boolean; charge?: Charge | null; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível gerar o Pix");
      if (j.paid) onPaid();
      else if (j.charge) setCharge(j.charge);
      else if (j.error) setError(j.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar o Pix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // confere o pagamento a cada 6 s enquanto a página está aberta
  useEffect(() => {
    if (!charge) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/pagamentos/pix/${token}`, { cache: "no-store" });
        const j = (await res.json()) as { paid?: boolean };
        if (j.paid) {
          clearInterval(t);
          toast.success("Pagamento confirmado!");
          onPaid();
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, token]);

  if (loading && !charge) return <p className="mt-3 flex items-center gap-2 text-[14px] text-muted"><Spinner size={16} /> Gerando QR Code Pix…</p>;
  if (error) {
    return (
      <div className="mt-3">
        <p className="text-[14px] text-ketchup-500">{error}</p>
        <button type="button" onClick={() => void create()} className="mt-2 rounded-lg border border-ink px-4 py-2 text-[13px] font-semibold">Tentar de novo</button>
      </div>
    );
  }
  if (!charge) return null;
  const left = charge.expires_at ? Math.max(0, new Date(charge.expires_at).getTime() - now) : null;
  const expired = left !== null && left <= 0;
  const mm = left !== null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` : null;
  return (
    <div className="mt-3">
      {expired ? (
        <div className="rounded-xl bg-sunken p-4 text-center">
          <p className="text-[14px] font-medium">Este QR Code expirou</p>
          <button type="button" onClick={() => void create()} className="mt-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white">Gerar novo QR Code</button>
        </div>
      ) : (
        <>
          {charge.qr_code_base64 && (
            <img src={`data:image/png;base64,${charge.qr_code_base64}`} alt={`QR Code Pix de ${money(total)}`} width={220} height={220} className="mx-auto h-[220px] w-[220px] rounded-lg border border-line bg-white p-2 [image-rendering:pixelated]" />
          )}
          {charge.qr_code && (
            <div className="mt-3">
              <p className="text-[13px] text-muted">Pix copia e cola</p>
              <div className="mt-1 flex gap-2">
                <code className="block min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px]">{charge.qr_code}</code>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(charge.qr_code ?? ""); toast.success("Código Pix copiado"); }} className="shrink-0 rounded-lg bg-ink px-4 text-[13px] font-semibold text-white">Copiar</button>
              </div>
            </div>
          )}
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Spinner size={14} /> Aguardando pagamento{mm ? ` · expira em ${mm}` : ""}. A confirmação é automática.
          </p>
        </>
      )}
    </div>
  );
}
