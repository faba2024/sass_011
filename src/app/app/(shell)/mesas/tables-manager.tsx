"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { downloadDataUrl, useQr } from "@/components/ui/qr";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { ORDER_STATUS, PAYMENT_METHOD, TABLE_STATUS } from "@/lib/constants";
import { storeUrl } from "@/lib/env";
import { money, time } from "@/lib/format";
import type { OrderStatus, TableStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { closeTableAction, createTablesBatchAction, deleteTableAction, regenerateQrAction, saveTableAction, setTableStatusAction } from "./actions";

export interface TableRow { id: string; label: string; seats: number; status: TableStatus; qr_token: string; is_active: boolean; sort: number }
type Session = { id: string; table_id: string; opened_at: string; orders: { id: string; number: number; status: string; total: number; customer_name: string | null; created_at: string }[] };

export function TablesManager({ tables, sessions, slug, tz }: { tables: TableRow[]; sessions: Session[]; slug: string; tz: string }) {
  const [open, setOpen] = useState<TableRow | null>(null);
  const [editing, setEditing] = useState<TableRow | "new" | null>(null);
  const [batch, setBatch] = useState(false);
  const { run } = useAction();
  const confirm = useConfirm();
  const sessionOf = (t: TableRow) => sessions.find((s) => s.table_id === t.id);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-4 text-[13px]">
          {(Object.keys(TABLE_STATUS) as TableStatus[]).map((s) => <span key={s} className="flex items-center gap-1.5"><Badge tone={TABLE_STATUS[s].tone} dot>{TABLE_STATUS[s].label}</Badge><b className="num">{tables.filter((t) => t.status === s).length}</b></span>)}
        </div>
        <div className="ml-auto flex gap-2">
          <Button icon="layers" onClick={() => setBatch(true)}>Criar várias</Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Nova mesa</Button>
        </div>
      </div>
      {tables.length === 0 ? (
        <EmptyState icon="table" title="Nenhuma mesa" description="Cadastre as mesas para gerar os QR Codes de pedido no local." action={<Button variant="primary" onClick={() => setBatch(true)}>Criar mesas</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {tables.map((t) => {
            const s = sessionOf(t);
            const total = s?.orders.filter((o) => o.status !== "cancelled").reduce((a, o) => a + Number(o.total), 0) ?? 0;
            return (
              <button key={t.id} type="button" onClick={() => setOpen(t)} className={cn("flex flex-col rounded-xl border-2 bg-surface p-3 text-left shadow-card transition hover:shadow-pop", t.status === "free" ? "border-line" : t.status === "occupied" ? "border-ember-400" : "border-mustard-400", !t.is_active && "opacity-50")}>
                <div className="flex items-start justify-between">
                  <p className="font-display text-lg font-bold">{t.label}</p>
                  <span className="text-xs text-muted">{t.seats} lug.</span>
                </div>
                <Badge tone={TABLE_STATUS[t.status].tone} dot className="mt-1 self-start">{TABLE_STATUS[t.status].label}</Badge>
                <p className="num mt-3 text-[15px] font-semibold">{s ? money(total) : "—"}</p>
                <p className="text-xs text-muted">{s ? `${s.orders.length} pedido(s) · desde ${time(s.opened_at, tz)}` : "Sem conta aberta"}</p>
              </button>
            );
          })}
        </div>
      )}

      <TableDetail
        table={open}
        session={open ? sessionOf(open) : undefined}
        slug={slug}
        tz={tz}
        onClose={() => setOpen(null)}
        onEdit={() => { setEditing(open); setOpen(null); }}
        onDelete={async () => { if (open && (await confirm({ title: `Excluir ${open.label}?`, description: "O QR Code impresso deixa de funcionar.", tone: "danger", confirmLabel: "Excluir" }))) { void run(() => deleteTableAction(open.id), { success: "Mesa excluída" }); setOpen(null); } }}
      />
      <TableModal value={editing} onClose={() => setEditing(null)} />
      <BatchModal open={batch} onClose={() => setBatch(false)} />
    </>
  );
}

function TableDetail({ table, session, slug, tz, onClose, onEdit, onDelete }: { table: TableRow | null; session?: Session; slug: string; tz: string; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const url = table ? storeUrl(slug, `/mesa/${table.qr_token}`) : "";
  const qr = useQr(url || "-");
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [method, setMethod] = useState<"pix" | "cash" | "card">("card");
  if (!table) return null;
  const orders = session?.orders.filter((o) => o.status !== "cancelled") ?? [];
  const total = orders.reduce((a, o) => a + Number(o.total), 0);
  const inKitchen = orders.some((o) => ["new", "awaiting_confirmation", "confirmed", "preparing"].includes(o.status));
  return (
    <Modal open onClose={onClose} title={table.label} description={`${TABLE_STATUS[table.status].label} · ${table.seats} lugares`} size="lg"
      footer={
        <>
          <Menu align="left" items={[
            { label: "Editar mesa", icon: "edit", onSelect: onEdit },
            { label: "Gerar novo QR Code", icon: "refresh", onSelect: async () => { if (await confirm({ title: "Gerar novo QR Code?", description: "O QR antigo para de funcionar. Use se um QR foi copiado indevidamente.", confirmLabel: "Gerar" })) void run(() => regenerateQrAction(table.id), { success: "Novo QR gerado" }); } },
            { label: "Excluir mesa", icon: "trash", danger: true, onSelect: onDelete },
          ]} />
          <span className="flex-1" />
          {table.status === "occupied" && session && <Button disabled={pending} onClick={() => run(() => setTableStatusAction(table.id, "awaiting_payment"), { success: "Conta solicitada" })}>Pedir a conta</Button>}
          {table.status !== "free" && !session && <Button disabled={pending} onClick={() => run(() => setTableStatusAction(table.id, "free"), { success: "Mesa liberada", onSuccess: onClose })}>Liberar mesa</Button>}
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">Conta da mesa</h3>
          {!session ? <p className="rounded-lg bg-sunken px-4 py-6 text-center text-[13px] text-muted">Nenhum pedido aberto. A conta abre sozinha no primeiro pedido pelo QR.</p> : (
            <>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {session.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <Link href={`/app/pedidos/${o.id}`} className="font-mono font-semibold hover:text-ember-600">#{o.number}</Link>
                    <span className="flex-1 truncate text-muted">{o.customer_name} · {time(o.created_at, tz)}</span>
                    <Badge tone={ORDER_STATUS[o.status as OrderStatus].tone}>{ORDER_STATUS[o.status as OrderStatus].short}</Badge>
                    <span className={cn("num w-20 text-right", o.status === "cancelled" && "text-faint line-through")}>{money(o.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between font-display text-xl font-bold"><span>Total</span><span className="num">{money(total)}</span></div>
              <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                <p className="mb-2 text-[13px] font-medium">Fechar conta</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["pix", "cash", "card"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)} className={cn("flex h-10 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium", method === m ? "border-ember-500 bg-ember-50 text-ember-700" : "border-line bg-surface")}>
                      <Icon name={m === "pix" ? "pix" : m === "cash" ? "cash" : "card"} size={15} />{PAYMENT_METHOD[m]}
                    </button>
                  ))}
                </div>
                {inKitchen && <p className="mt-2 text-xs text-mustard-700">Há pedidos ainda na cozinha. Conclua antes de fechar.</p>}
                <Button variant="success" block className="mt-3" icon="check" loading={pending} disabled={inKitchen || orders.length === 0} onClick={async () => { if (await confirm({ title: `Fechar conta de ${money(total)}?`, description: `Pagamento: ${PAYMENT_METHOD[method]}. Os pedidos são concluídos e lançados no financeiro.`, confirmLabel: "Fechar conta" })) void run(() => closeTableAction(session.id, method), { success: `${table.label} liberada`, onSuccess: onClose }); }}>Receber e liberar mesa</Button>
              </div>
            </>
          )}
        </div>
        <div className="text-center">
          <div className="rounded-lg border border-line p-2">{qr ? <img src={qr} alt={`QR Code ${table.label}`} className="aspect-square w-full" /> : <div className="skeleton aspect-square" />}</div>
          <p className="mt-2 break-all font-mono text-[10px] text-muted">{url}</p>
          <Button size="sm" icon="download" block className="mt-2" disabled={!qr} onClick={() => qr && downloadDataUrl(qr, `qr-${table.label.toLowerCase().replace(/\s+/g, "-")}.png`)}>Baixar PNG</Button>
        </div>
      </div>
    </Modal>
  );
}

function TableModal({ value, onClose }: { value: TableRow | "new" | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ label: "", seats: 4, is_active: true });
  useEffect(() => {
    if (value && value !== "new") setF({ label: value.label, seats: value.seats, is_active: value.is_active });
    else setF({ label: "", seats: 4, is_active: true });
  }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Nova mesa" : "Editar mesa"} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveTableAction(f, value && value !== "new" ? value.id : null), { success: "Mesa salva", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome" required><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Mesa 09" /></Field>
        <Field label="Lugares"><Input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} /></Field>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Ativa (aceita pedidos pelo QR) <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></label>
      </div>
    </Modal>
  );
}

function BatchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, pending } = useAction();
  const [count, setCount] = useState(6);
  const [prefix, setPrefix] = useState("Mesa");
  return (
    <Modal open={open} onClose={onClose} title="Criar várias mesas" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => createTablesBatchAction(count, prefix), { success: `${count} mesas criadas`, onSuccess: onClose })}>Criar</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantidade"><Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
        <Field label="Prefixo"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
