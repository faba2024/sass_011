"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { assignDriverAction, getOrderDetailAction, logWhatsappAction, markPaidAction, updateOrderNotesAction, updateStatusAction } from "@/app/app/(shell)/pedidos/actions";
import { useApp } from "@/components/app/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Notice, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { NEXT_LABEL, ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD, nextStatus } from "@/lib/constants";
import { storeUrl } from "@/lib/env";
import { addressLine, dateTime, money, phone, time } from "@/lib/format";
import type { OrderStatus, OrderWithItems, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { renderTemplate, waLink } from "@/lib/whatsapp";
import { OrderItems } from "./order-items";

type Detail = NonNullable<Awaited<ReturnType<typeof getOrderDetailAction>>["data"]>;

const CANCEL_REASONS = ["Cliente desistiu", "Endereço fora da área", "Produto em falta", "Pedido duplicado", "Pagamento não confirmado", "Loja sem condições de atender"];

export function whatsappVars(order: OrderWithItems, orgName: string, slug: string) {
  const eta = order.eta_min ? `${order.eta_min}–${order.eta_max} min` : "";
  const payment =
    order.payment_method === "cash" && order.change_for
      ? `Pagamento em dinheiro, troco para ${money(order.change_for)}.`
      : order.payment_status === "paid"
        ? "Pagamento já confirmado."
        : `Pagamento: ${PAYMENT_METHOD[order.payment_method]}.`;
  return {
    cliente: (order.customer_name ?? "").split(" ")[0] || "cliente",
    numero: String(order.number),
    total: money(order.total),
    link: storeUrl(slug, `/pedido/${order.public_token}`),
    previsao: eta,
    pagamento: payment,
    loja: orgName,
    endereco: addressLine(order.address),
  };
}

export function OrderDetail({ orderId, onChanged, compact }: { orderId: string; onChanged?: () => void; compact?: boolean }) {
  const { org, can } = useApp();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await getOrderDetailAction(orderId);
    if (res.ok && res.data) {
      setData(res.data);
      setError(null);
    } else setError(res.error ?? "Erro ao carregar");
  }, [orderId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  if (error) return <div className="p-5"><ErrorState description={error} action={<Button onClick={load} icon="refresh">Tentar de novo</Button>} /></div>;
  if (!data) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-60" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const o = data.order;
  const next = nextStatus(o.status, o.type);
  const final = o.status === "delivered" || o.status === "cancelled";
  const manage = can("orders.manage");

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "Não foi possível concluir");
    toast.success(success);
    await load();
    onChanged?.();
  };

  const advance = (to: OrderStatus) => act("advance", () => updateStatusAction(o.id, to), `Pedido #${o.number}: ${ORDER_STATUS[to].label.toLowerCase()}`);

  const sendWhatsapp = async (tpl: { key: string; body: string } | null) => {
    if (!o.customer_phone) return toast.error("Pedido sem telefone do cliente");
    const body = tpl ? renderTemplate(tpl.body, whatsappVars(o, org.name, org.slug)) : "";
    window.open(waLink(o.customer_phone, body || undefined), "_blank", "noopener");
    if (tpl) await logWhatsappAction({ orderId: o.id, customerId: o.customer_id, templateKey: tpl.key, phone: o.customer_phone, body });
  };

  const print = (w: 58 | 80) => window.open(`/app/imprimir/${o.id}?w=${w}`, "_blank", "noopener,width=420,height=700");

  return (
    <div className={cn("pb-6", compact ? "px-5 pt-4" : "")}>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="num font-mono text-2xl font-bold">#{o.number}</h2>
            <Badge tone={ORDER_STATUS[o.status].tone} dot>{ORDER_STATUS[o.status].label}</Badge>
            <Badge tone={o.type === "delivery" ? "violet" : "neutral"}>{ORDER_TYPE[o.type].label}{data.tableLabel ? ` · ${data.tableLabel}` : ""}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {dateTime(o.created_at, org.timezone)} · origem {o.source === "online" ? "cardápio online" : o.source === "table" ? "QR da mesa" : o.source === "pdv" ? "balcão (PDV)" : "painel"}
            {o.scheduled_for && <b className="text-mustard-700"> · agendado para {dateTime(o.scheduled_for, org.timezone)}</b>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Menu
            label="Imprimir"
            trigger={<Icon name="printer" size={18} />}
            items={[
              { label: "Imprimir 80 mm", icon: "printer", onSelect: () => print(80) },
              { label: "Imprimir 58 mm", icon: "printer", onSelect: () => print(58) },
            ]}
          />
          {o.customer_phone && (
            <Menu
              label="WhatsApp"
              trigger={<Icon name="whatsapp" size={18} />}
              items={[
                ...data.templates.map((t) => ({ label: t.name, icon: "send" as const, onSelect: () => void sendWhatsapp(t) })),
                "divider" as const,
                { label: "Abrir conversa", icon: "whatsapp" as const, onSelect: () => void sendWhatsapp(null) },
              ]}
            />
          )}
          <Menu
            items={[
              { label: "Copiar link de acompanhamento", icon: "link", onSelect: () => { void navigator.clipboard.writeText(storeUrl(org.slug, `/pedido/${o.public_token}`)); toast.success("Link copiado"); } },
              { label: "Abrir página do cliente", icon: "external", onSelect: () => window.open(storeUrl(org.slug, `/pedido/${o.public_token}`), "_blank") },
              ...(compact ? [{ label: "Abrir em tela cheia", icon: "maximize" as const, onSelect: () => window.location.assign(`/app/pedidos/${o.id}`) }] : []),
              ...(manage ? [{ label: "Observação interna", icon: "edit" as const, onSelect: () => setNotesOpen(true) }] : []),
            ]}
          />
        </div>
      </div>

      {/* Ações principais */}
      {!final && (
        <div className="mt-4 flex flex-wrap gap-2">
          {next && (manage || ((next === "preparing" || next === "ready") && can("kitchen.view"))) && (
            <Button variant={o.status === "new" || o.status === "awaiting_confirmation" ? "primary" : "dark"} size="lg" icon="check" loading={busy === "advance"} onClick={() => advance(next)} className="flex-1 sm:flex-none">
              {NEXT_LABEL[next]}
            </Button>
          )}
          {manage && o.status === "new" && (
            <Button variant="secondary" size="lg" disabled={busy !== null} onClick={() => advance("awaiting_confirmation")}>
              Aguardar confirmação
            </Button>
          )}
          {manage && o.type === "delivery" && o.status === "ready" && (
            <Button variant="secondary" size="lg" disabled={busy !== null} onClick={() => advance("delivered")}>
              Cliente retirou
            </Button>
          )}
          {manage && (
            <Button variant="ghost" size="lg" className="text-ketchup-500 hover:bg-ketchup-50" onClick={() => setCancelOpen(true)}>
              Cancelar
            </Button>
          )}
        </div>
      )}
      {o.status === "cancelled" && (
        <Notice tone="error" className="mt-4">
          Cancelado em {dateTime(o.cancelled_at, org.timezone)} — <b>{o.cancel_reason}</b>
        </Notice>
      )}

      <div className={cn("mt-5 grid gap-5", !compact && "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <div className="space-y-5">
          {/* Itens */}
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">Itens</h3>
            <OrderItems items={o.order_items} />
            {o.notes && <p className="mt-3 rounded-md bg-mustard-50 px-3 py-2 text-[13px] text-mustard-700"><b>Observação:</b> {o.notes}</p>}
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="num">{money(o.subtotal)}</dd></div>
              {Number(o.delivery_fee) > 0 && <div className="flex justify-between"><dt className="text-muted">Taxa de entrega</dt><dd className="num">{money(o.delivery_fee)}</dd></div>}
              {Number(o.discount) > 0 && <div className="flex justify-between text-pickle-700"><dt>Desconto{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd className="num">− {money(o.discount)}</dd></div>}
              <div className="flex justify-between pt-1 font-display text-base font-semibold"><dt>Total</dt><dd className="num">{money(o.total)}</dd></div>
            </dl>
          </section>

          {/* Histórico */}
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">Histórico</h3>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {data.history.map((h) => (
                <li key={h.id} className="relative">
                  <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface", h.to_status === "cancelled" ? "bg-ketchup-500" : "bg-ember-500")} />
                  <p className="text-[13px]">
                    <b>{ORDER_STATUS[h.to_status].label}</b> <span className="text-muted">· {time(h.created_at, org.timezone)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {h.profile?.full_name ?? h.profile?.email ?? (h.from_status ? "Sistema" : "Cliente")}
                    {h.note ? ` — ${h.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          {/* Cliente */}
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Cliente</h3>
            <p className="font-medium">{o.customer_name ?? "Cliente"}</p>
            {o.customer_phone && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px]">
                <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1 text-ink-2 hover:text-ink"><Icon name="phone" size={14} />{phone(o.customer_phone)}</a>
                <a href={waLink(o.customer_phone)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-pickle-700 hover:underline"><Icon name="whatsapp" size={14} />WhatsApp</a>
              </div>
            )}
            {data.customer && (
              <p className="mt-2 text-xs text-muted">
                {data.customer.orders_count} pedido(s) concluído(s) · {money(data.customer.total_spent)} gastos ·{" "}
                <Link href={`/app/clientes/${data.customer.id}`} className="font-medium text-ember-600 hover:underline">ver ficha</Link>
              </p>
            )}
            {o.address && (
              <div className="mt-3 rounded-md bg-paper p-3 text-[13px]">
                <p className="font-medium">{o.address.street}, {o.address.number}</p>
                <p className="text-ink-2">{[o.address.complement, o.address.district, o.address.city].filter(Boolean).join(" · ")}</p>
                {o.address.reference && <p className="mt-1 text-muted">Ref.: {o.address.reference}</p>}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address.street}, ${o.address.number} ${o.address.district} ${o.address.city ?? ""}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ember-600 hover:underline"
                >
                  <Icon name="map" size={13} /> Abrir no mapa
                </a>
              </div>
            )}
          </section>

          {/* Pagamento */}
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Pagamento</h3>
            <div className="flex items-center justify-between">
              <span className="font-medium">{PAYMENT_METHOD[o.payment_method]}</span>
              <Badge tone={o.payment_status === "paid" ? "green" : o.payment_status === "refunded" ? "red" : "mustard"}>
                {o.payment_status === "paid" ? "Pago" : o.payment_status === "refunded" ? "Estornado" : "Pendente"}
              </Badge>
            </div>
            {o.payment_method === "cash" && o.change_for && (
              <p className="mt-1 text-[13px] text-ink-2">
                Troco para {money(o.change_for)} → levar <b className="num">{money(Number(o.change_for) - Number(o.total))}</b>
              </p>
            )}
            {o.payment_status === "pending" && o.status !== "cancelled" && (can("orders.manage") || can("cash.operate")) && (
              <Button size="sm" variant="secondary" icon="check" className="mt-3" onClick={() => setPayOpen(true)}>
                {o.payment_method === "pix" ? "Confirmar Pix recebido" : "Registrar pagamento"}
              </Button>
            )}
            {o.payment_method === "pix" && o.payment_status === "pending" && (
              <p className="mt-2 text-xs text-muted">Confirme somente após ver o valor no extrato. Nada é marcado como pago automaticamente.</p>
            )}
          </section>

          {/* Entregador */}
          {o.type === "delivery" && (can("orders.manage") || can("delivery.manage")) && (
            <section className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Entregador</h3>
              <Select
                value={o.driver_id ?? ""}
                disabled={final || busy !== null}
                onChange={(e) => act("driver", () => assignDriverAction(o.id, e.target.value || null), e.target.value ? "Entregador atribuído" : "Entregador removido")}
              >
                <option value="">Sem entregador</option>
                {data.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.status === "available" ? "disponível" : d.status === "on_delivery" ? "em entrega" : "offline"}
                  </option>
                ))}
              </Select>
              {data.drivers.length === 0 && <p className="mt-2 text-xs text-muted">Cadastre entregadores em <Link href="/app/entregadores" className="text-ember-600 hover:underline">Entregadores</Link>.</p>}
            </section>
          )}
        </div>
      </div>

      <CancelModal
        open={cancelOpen}
        status={o.status}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason, restock) => {
          setCancelOpen(false);
          await act("cancel", () => updateStatusAction(o.id, "cancelled", reason, restock), `Pedido #${o.number} cancelado`);
        }}
      />
      <PayModal
        open={payOpen}
        current={o.payment_method}
        total={o.total}
        onClose={() => setPayOpen(false)}
        onConfirm={async (method) => {
          setPayOpen(false);
          await act("pay", () => markPaidAction(o.id, method), "Pagamento registrado");
        }}
      />
      <NotesModal
        open={notesOpen}
        initial={o.notes ?? ""}
        onClose={() => setNotesOpen(false)}
        onSave={async (notes) => {
          setNotesOpen(false);
          await act("notes", () => updateOrderNotesAction(o.id, notes), "Observação salva");
        }}
      />
    </div>
  );
}

function CancelModal({ open, status, onClose, onConfirm }: { open: boolean; status: OrderStatus; onClose: () => void; onConfirm: (reason: string, restock: boolean | null) => void }) {
  const [reason, setReason] = useState("");
  const started = ["preparing", "ready", "out_for_delivery"].includes(status);
  const [restock, setRestock] = useState(!started);
  useEffect(() => {
    if (open) {
      setReason("");
      setRestock(!started);
    }
  }, [open, started]);
  const deducted = status !== "new" && status !== "awaiting_confirmation";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancelar pedido"
      description="O pedido fica no histórico com motivo, usuário e horário."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim(), deducted ? restock : null)}>
            Cancelar pedido
          </Button>
        </>
      }
    >
      <Field label="Motivo" required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Descreva o motivo" />
      </Field>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CANCEL_REASONS.map((s) => (
          <button key={s} type="button" onClick={() => setReason(s)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink-2 hover:bg-sunken">
            {s}
          </button>
        ))}
      </div>
      {deducted && (
        <div className="mt-4 rounded-md border border-line bg-paper p-3">
          <Checkbox
            checked={restock}
            onChange={setRestock}
            label="Devolver insumos ao estoque"
            description={started ? "O preparo já começou: por padrão os insumos contam como consumidos. Marque se nada foi produzido." : "O preparo não começou: os insumos voltam ao estoque."}
          />
        </div>
      )}
    </Modal>
  );
}

function PayModal({ open, current, total, onClose, onConfirm }: { open: boolean; current: PaymentMethod; total: number; onClose: () => void; onConfirm: (m: PaymentMethod) => void }) {
  const [method, setMethod] = useState<PaymentMethod>(current);
  useEffect(() => setMethod(current), [current, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pagamento"
      description={`Total do pedido: ${money(total)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="success" icon="check" onClick={() => onConfirm(method)}>Confirmar recebimento</Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {(["pix", "cash", "card"] as PaymentMethod[]).map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-[13px] font-medium", method === m ? "border-ember-500 bg-ember-50 text-ember-700" : "border-line hover:bg-sunken")}>
            <Icon name={m === "pix" ? "pix" : m === "cash" ? "cash" : "card"} size={18} />
            {PAYMENT_METHOD[m]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Com o caixa aberto, o recebimento também entra no fechamento do caixa.</p>
    </Modal>
  );
}

function NotesModal({ open, initial, onClose, onSave }: { open: boolean; initial: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title="Observação do pedido" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant="dark" onClick={() => onSave(v)}>Salvar</Button></>}>
      <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={4} maxLength={500} />
    </Modal>
  );
}
