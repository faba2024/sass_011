"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/hooks/use-action";
import { money } from "@/lib/format";
import { FEATURE_LABELS } from "@/lib/permissions";
import { savePlanAction } from "../actions";

export interface PlanRow { id: string; code: string; name: string; description: string | null; price: number; limits: { max_members: number | null; max_products: number | null; max_orders_month: number | null }; features: string[]; is_active: boolean; sort: number; subscribers?: number }

export function PlansView({ plans }: { plans: PlanRow[] }) {
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo plano</Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className={p.is_active ? "" : "opacity-60"}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">{p.code}</p>
                <p className="font-display text-xl font-semibold">{p.name}</p>
              </div>
              {!p.is_active && <Badge>Inativo</Badge>}
            </div>
            <p className="num mt-2 font-display text-3xl font-semibold">{money(p.price)}<span className="text-sm font-normal text-muted">/mês</span></p>
            {p.description && <p className="mt-2 text-[13px] text-muted">{p.description}</p>}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <div><dt className="text-muted">Usuários</dt><dd className="font-medium">{p.limits.max_members ?? "∞"}</dd></div>
              <div><dt className="text-muted">Produtos</dt><dd className="font-medium">{p.limits.max_products ?? "∞"}</dd></div>
              <div><dt className="text-muted">Pedidos/mês</dt><dd className="font-medium">{p.limits.max_orders_month ?? "∞"}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-1">{p.features.map((f) => <Badge key={f} tone="neutral">{FEATURE_LABELS[f as keyof typeof FEATURE_LABELS] ?? f}</Badge>)}</div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-muted">{p.subscribers ?? 0} empresa(s)</span>
              <Button size="sm" icon="edit" onClick={() => setEditing(p)}>Editar</Button>
            </div>
          </Card>
        ))}
      </div>
      {editing && <PlanForm plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanForm({ plan, onClose }: { plan: PlanRow | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({
    code: plan?.code ?? "", name: plan?.name ?? "", description: plan?.description ?? "", price: plan ? Number(plan.price) : null as number | null,
    max_members: plan?.limits.max_members ?? null, max_products: plan?.limits.max_products ?? null, max_orders_month: plan?.limits.max_orders_month ?? null,
    features: plan?.features ?? ["cardapio_online", "pedidos", "cozinha", "delivery", "clientes", "cupons"], is_active: plan?.is_active ?? true, sort: plan?.sort ?? 10,
  });
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Modal open onClose={onClose} size="lg" title={plan ? `Editar ${plan.name}` : "Novo plano"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => savePlanAction({ ...f, price: f.price ?? 0, description: f.description || null, features: f.features as never }, plan?.id), { success: "Plano salvo", onSuccess: onClose })}>Salvar plano</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Código" required><Input value={f.code} disabled={Boolean(plan)} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono" /></Field>
        <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Preço mensal" required><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Descrição" className="sm:col-span-3"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Máx. usuários" help="Vazio = ilimitado"><Input type="number" min={1} value={f.max_members ?? ""} onChange={(e) => setF({ ...f, max_members: num(e.target.value) })} /></Field>
        <Field label="Máx. produtos" help="Vazio = ilimitado"><Input type="number" min={1} value={f.max_products ?? ""} onChange={(e) => setF({ ...f, max_products: num(e.target.value) })} /></Field>
        <Field label="Máx. pedidos/mês" help="Vazio = ilimitado"><Input type="number" min={1} value={f.max_orders_month ?? ""} onChange={(e) => setF({ ...f, max_orders_month: num(e.target.value) })} /></Field>
      </div>
      <p className="mb-2 mt-5 text-[13px] font-medium">Recursos liberados</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(FEATURE_LABELS).map(([k, label]) => (
          <Checkbox key={k} checked={f.features.includes(k)} onChange={(v) => setF({ ...f, features: v ? [...f.features, k] : f.features.filter((x) => x !== k) })} label={label} />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-6">
        <Checkbox checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Disponível para novas assinaturas" />
        <Field label="Ordem"><Input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} className="w-20" /></Field>
      </div>
    </Modal>
  );
}
