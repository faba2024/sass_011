"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { DRIVER_STATUS, ORDER_STATUS } from "@/lib/constants";
import { maskPhone, money, phone } from "@/lib/format";
import type { DriverStatus, OrderRow } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { assignDriverAction } from "../pedidos/actions";
import { deleteDriverAction, saveDriverAction } from "./actions";

export interface Driver { id: string; name: string; phone: string | null; vehicle: string | null; plate: string | null; status: DriverStatus; is_active: boolean; user_id: string | null }
type O = Pick<OrderRow, "id" | "number" | "customer_name" | "address" | "status" | "driver_id" | "total" | "payment_method" | "payment_status">;

export function DriversManager({ drivers, orders, deliveredToday }: { drivers: Driver[]; orders: O[]; deliveredToday: Record<string, number> }) {
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const unassigned = orders.filter((o) => !o.driver_id);
  const activeDrivers = drivers.filter((d) => d.is_active);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo entregador</Button></div>
        {drivers.length === 0 ? (
          <EmptyState icon="bike" title="Nenhum entregador" description="Cadastre entregadores aqui. Para que usem a tela mobile, crie o acesso em Funcionários com a função Entregador." action={<Button variant="primary" onClick={() => setEditing("new")}>Cadastrar</Button>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {drivers.map((d) => {
              const mine = orders.filter((o) => o.driver_id === d.id);
              return (
                <article key={d.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.name}{!d.is_active && <span className="ml-2 text-xs text-muted">(inativo)</span>}</p>
                      <p className="text-xs text-muted">{[d.vehicle, d.plate].filter(Boolean).join(" · ") || "—"}{d.user_id ? " · com acesso ao app" : ""}</p>
                    </div>
                    <Badge tone={DRIVER_STATUS[d.status].tone} dot>{DRIVER_STATUS[d.status].label}</Badge>
                  </div>
                  <Segmented size="sm" className="mt-3" value={d.status} onChange={(s) => run(() => saveDriverAction({ ...d, status: s }, d.id), { success: `${d.name}: ${DRIVER_STATUS[s].label.toLowerCase()}` })} items={[{ value: "available", label: "Disponível" }, { value: "on_delivery", label: "Em entrega" }, { value: "offline", label: "Offline" }]} />
                  <p className="mt-3 text-xs text-muted">{deliveredToday[d.id] ?? 0} entrega(s) hoje · {mine.length} atribuída(s) agora</p>
                  {mine.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {mine.map((o) => <li key={o.id} className="flex justify-between text-[13px]"><Link href={`/app/pedidos/${o.id}`} className="font-mono font-semibold hover:text-ember-600">#{o.number}</Link><span className="truncate px-2 text-ink-2">{o.customer_name}</span><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].short}</Badge></li>)}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
                    {d.phone && <a href={`tel:${d.phone}`} className="text-[13px] text-ink-2 hover:text-ink">{phone(d.phone)}</a>}
                    {d.phone && <a href={waLink(d.phone)} target="_blank" rel="noreferrer" className="ml-2 text-[13px] text-pickle-700 hover:underline">WhatsApp</a>}
                    <span className="ml-auto flex">
                      <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(d)} />
                      <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir ${d.name}?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteDriverAction(d.id), { success: "Entregador excluído" }); }} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <Card>
        <CardHeader title="Entregas sem entregador" description="Atribua em um clique. O entregador vê na tela dele na hora." />
        {unassigned.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">Nenhuma entrega pendente de atribuição.</p> : (
          <ul className="divide-y divide-line">
            {unassigned.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <Link href={`/app/pedidos/${o.id}`} className="font-mono font-semibold">#{o.number}</Link>
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].short}</Badge>
                  <span className="num font-semibold">{money(o.total)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{o.customer_name} · {o.address?.district}</p>
                <Select className="mt-2" disabled={pending || activeDrivers.length === 0} value="" onChange={(e) => e.target.value && run(() => assignDriverAction(o.id, e.target.value), { success: `Pedido #${o.number} atribuído` })}>
                  <option value="">{activeDrivers.length ? "Atribuir a…" : "Cadastre um entregador"}</option>
                  {activeDrivers.map((d) => <option key={d.id} value={d.id}>{d.name} — {DRIVER_STATUS[d.status].label.toLowerCase()}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <DriverModal value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function DriverModal({ value, onClose }: { value: Driver | "new" | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", phone: "", vehicle: "Moto", plate: "", status: "offline" as DriverStatus, is_active: true });
  useEffect(() => {
    if (value && value !== "new") setF({ name: value.name, phone: maskPhone(value.phone ?? ""), vehicle: value.vehicle ?? "", plate: value.plate ?? "", status: value.status, is_active: value.is_active });
    else setF({ name: "", phone: "", vehicle: "Moto", plate: "", status: "offline", is_active: true });
  }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Novo entregador" : "Editar entregador"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveDriverAction(f, value && value !== "new" ? value.id : null), { success: "Entregador salvo", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Celular"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
        <Field label="Veículo"><Input value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} /></Field>
        <Field label="Placa"><Input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} /></Field>
        <Field label="Situação"><Select value={f.is_active ? "1" : "0"} onChange={(e) => setF({ ...f, is_active: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></Select></Field>
      </div>
    </Modal>
  );
}
