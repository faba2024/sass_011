"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app/app-context";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/hooks/use-action";
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD, SEGMENTS } from "@/lib/constants";
import { date, dateTime, maskCep, maskPhone, money, phone } from "@/lib/format";
import type { OrderStatus, OrderType, PaymentMethod } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { addAddressAction, adjustPointsAction, deleteAddressAction, deleteCustomerAction, redeemRewardAction, saveCustomerAction } from "../actions";

export interface CustomerFull {
  id: string; name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null; tags: string[];
  orders_count: number; total_spent: number; first_order_at: string | null; last_order_at: string | null; created_at: string;
  customer_addresses: { id: string; zip: string | null; street: string; number: string; district: string; complement: string | null; reference: string | null; city: string | null; last_used_at: string }[];
}

export function CustomerDetail({ customer: c, segment, orders, loyalty, reviews, tz }: {
  customer: CustomerFull; segment: { segment: string; avg_ticket: number };
  orders: { id: string; number: number; created_at: string; status: string; type: string; total: number; payment_method: string }[];
  loyalty: { enabled: boolean; balance: number; lifetime: number; transactions: { id: string; kind: string; points: number; description: string | null; created_at: string }[]; rewards: { id: string; name: string; points_cost: number }[] };
  reviews: { id: string; rating: number; comment: string | null; created_at: string }[];
  tz: string;
}) {
  const { can } = useApp();
  const router = useRouter();
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const manage = can("customers.manage");
  const [f, setF] = useState({ name: c.name, phone: maskPhone(c.phone ?? ""), email: c.email ?? "", birthday: c.birthday ?? "", notes: c.notes ?? "", tags: c.tags });
  const [tagInput, setTagInput] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const dirty = f.name !== c.name || f.phone.replace(/\D/g, "") !== (c.phone ?? "") || f.email !== (c.email ?? "") || f.birthday !== (c.birthday ?? "") || f.notes !== (c.notes ?? "") || f.tags.join() !== c.tags.join();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={c.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold">{c.name}</h1>
          <p className="text-[13px] text-muted">{phone(c.phone)} · cliente desde {date(c.created_at, tz)}</p>
        </div>
        <Badge tone={SEGMENTS[segment.segment]?.tone ?? "neutral"}>{SEGMENTS[segment.segment]?.label}</Badge>
        {c.phone && <a href={waLink(c.phone, `Olá, ${c.name.split(" ")[0]}!`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium text-pickle-700 hover:bg-pickle-50">WhatsApp</a>}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-4">
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Pedidos concluídos</p><p className="num font-display text-xl font-semibold">{c.orders_count}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Total gasto</p><p className="num font-display text-xl font-semibold">{money(c.total_spent)}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Ticket médio</p><p className="num font-display text-xl font-semibold">{money(segment.avg_ticket)}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Último pedido</p><p className="num font-display text-xl font-semibold">{c.last_order_at ? date(c.last_order_at, tz) : "—"}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Dados" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2"><Input disabled={!manage} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Telefone"><Input disabled={!manage} value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
            <Field label="Aniversário"><Input disabled={!manage} type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></Field>
            <Field label="E-mail" className="sm:col-span-2"><Input disabled={!manage} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Tags" className="sm:col-span-2" help="Ex.: vip-manual, sem-lactose, aniversariante">
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface p-1.5">
                {f.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-sm bg-sunken px-2 py-0.5 text-xs">#{t}{manage && <button type="button" aria-label={`Remover ${t}`} onClick={() => setF({ ...f, tags: f.tags.filter((x) => x !== t) })} className="text-muted hover:text-ketchup-500">×</button>}</span>
                ))}
                {manage && <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-"); if (!f.tags.includes(t)) setF({ ...f, tags: [...f.tags, t] }); setTagInput(""); } }} placeholder="nova tag + Enter" className="min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none" />}
              </div>
            </Field>
            <Field label="Observações internas" className="sm:col-span-2"><Textarea disabled={!manage} rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Preferências, alergias, histórico…" /></Field>
          </div>
          {manage && (
            <div className="mt-4 flex justify-between gap-2">
              <Button variant="ghost" className="text-ketchup-500" icon="trash" onClick={async () => { if (await confirm({ title: `Excluir ${c.name}?`, description: "O histórico de pedidos é mantido.", tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteCustomerAction(c.id), { success: "Cliente excluído", onSuccess: () => router.push("/app/clientes") }); }}>Excluir</Button>
              <Button variant="dark" disabled={!dirty} loading={pending} onClick={() => run(() => saveCustomerAction(f, c.id), { success: "Cliente atualizado" })}>Salvar alterações</Button>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Endereços" actions={manage && <Button size="sm" icon="plus" onClick={() => setAddrOpen(true)}>Adicionar</Button>} />
            {c.customer_addresses.length === 0 ? <p className="text-[13px] text-muted">Nenhum endereço salvo.</p> : (
              <ul className="divide-y divide-line">
                {c.customer_addresses.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 py-2 text-[13px]">
                    <div className="flex-1"><p className="font-medium">{a.street}, {a.number}</p><p className="text-muted">{[a.complement, a.district, a.city].filter(Boolean).join(" · ")}{a.reference ? ` · Ref.: ${a.reference}` : ""}</p></div>
                    {manage && <IconButton icon="trash" label="Excluir endereço" size="sm" className="text-ketchup-500" onClick={() => run(() => deleteAddressAction(a.id, c.id), { success: "Endereço removido" })} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {loyalty.enabled && (
            <Card>
              <CardHeader title="Fidelidade" description={`${loyalty.lifetime} pontos acumulados no total`} actions={can("loyalty.manage") && <Button size="sm" onClick={() => setAdjustOpen(true)}>Ajustar</Button>} />
              <p className="num font-display text-3xl font-bold">{loyalty.balance} <span className="text-sm font-normal text-muted">pontos</span></p>
              {manage && loyalty.rewards.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {loyalty.rewards.map((r) => (
                    <Button key={r.id} size="sm" variant={loyalty.balance >= r.points_cost ? "secondary" : "ghost"} disabled={loyalty.balance < r.points_cost || pending} onClick={async () => { if (await confirm({ title: `Resgatar "${r.name}"?`, description: `Debita ${r.points_cost} pontos do cliente.`, confirmLabel: "Resgatar" })) void run(() => redeemRewardAction(c.id, r.id), { success: `Resgate: ${r.name}` }); }}>
                      {r.name} · {r.points_cost} pts
                    </Button>
                  ))}
                </div>
              )}
              {loyalty.transactions.length > 0 && (
                <ul className="mt-4 max-h-56 divide-y divide-line overflow-y-auto text-[13px]">
                  {loyalty.transactions.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2 py-1.5">
                      <span className="text-ink-2">{t.description}<span className="block text-xs text-faint">{dateTime(t.created_at, tz)}</span></span>
                      <span className={`num font-semibold ${t.points > 0 ? "text-pickle-700" : "text-ketchup-500"}`}>{t.points > 0 ? "+" : ""}{t.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      <Card padded={false}>
        <div className="px-5 pb-2 pt-4"><h2 className="font-display text-[15px] font-semibold">Histórico de pedidos</h2></div>
        {orders.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">Nenhum pedido.</p> : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/app/pedidos/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-paper">
                  <span className="num w-14 font-mono font-semibold">#{o.number}</span>
                  <span className="flex-1 text-muted">{dateTime(o.created_at, tz)} · {ORDER_TYPE[o.type as OrderType].short} · {PAYMENT_METHOD[o.payment_method as PaymentMethod]}</span>
                  <Badge tone={ORDER_STATUS[o.status as OrderStatus].tone}>{ORDER_STATUS[o.status as OrderStatus].short}</Badge>
                  <span className="num w-20 text-right font-semibold">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {reviews.length > 0 && (
        <Card>
          <CardHeader title="Avaliações deste cliente" />
          <ul className="space-y-2 text-[13px]">{reviews.map((r) => <li key={r.id}><span className="text-mustard-500">{"★".repeat(r.rating)}</span><span className="text-line-strong">{"★".repeat(5 - r.rating)}</span> <span className="text-muted">{date(r.created_at, tz)}</span>{r.comment && <p className="text-ink-2">“{r.comment}”</p>}</li>)}</ul>
        </Card>
      )}

      <AddressModal open={addrOpen} customerId={c.id} onClose={() => setAddrOpen(false)} />
      <AdjustModal open={adjustOpen} customerId={c.id} onClose={() => setAdjustOpen(false)} />
    </div>
  );
}

function AddressModal({ open, customerId, onClose }: { open: boolean; customerId: string; onClose: () => void }) {
  const { run, pending } = useAction();
  const [a, setA] = useState({ zip: "", street: "", number: "", district: "", complement: "", reference: "", city: "" });
  return (
    <Modal open={open} onClose={onClose} title="Novo endereço" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => addAddressAction({ ...a, customer_id: customerId }), { success: "Endereço salvo", onSuccess: () => { setA({ zip: "", street: "", number: "", district: "", complement: "", reference: "", city: "" }); onClose(); } })}>Salvar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr_100px]">
        <Field label="CEP"><Input value={a.zip} onChange={(e) => setA({ ...a, zip: maskCep(e.target.value) })} /></Field>
        <Field label="Rua" required><Input value={a.street} onChange={(e) => setA({ ...a, street: e.target.value })} /></Field>
        <Field label="Nº" required><Input value={a.number} onChange={(e) => setA({ ...a, number: e.target.value })} /></Field>
        <Field label="Bairro" required className="sm:col-span-2"><Input value={a.district} onChange={(e) => setA({ ...a, district: e.target.value })} /></Field>
        <Field label="Cidade"><Input value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} /></Field>
        <Field label="Complemento" className="sm:col-span-2"><Input value={a.complement} onChange={(e) => setA({ ...a, complement: e.target.value })} /></Field>
        <Field label="Referência"><Input value={a.reference} onChange={(e) => setA({ ...a, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ open, customerId, onClose }: { open: boolean; customerId: string; onClose: () => void }) {
  const { run, pending } = useAction();
  const [mode, setMode] = useState("add");
  const [points, setPoints] = useState(10);
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Ajustar pontos" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} disabled={reason.trim().length < 3} onClick={() => run(() => adjustPointsAction(customerId, mode === "add" ? points : -points, reason), { success: "Pontos ajustados", onSuccess: onClose })}>Confirmar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Operação"><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="add">Creditar</option><option value="remove">Debitar</option></Select></Field>
          <Field label="Pontos"><Input type="number" min={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} /></Field>
        </div>
        <Field label="Motivo" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: cortesia por atraso" /></Field>
      </div>
    </Modal>
  );
}
