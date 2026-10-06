"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Checkbox, Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/hooks/use-action";
import { COUPON_TYPE } from "@/lib/constants";
import { date, money } from "@/lib/format";
import type { CouponType } from "@/lib/types";
import { deleteCouponAction, saveCouponAction } from "./actions";

export interface Coupon { id: string; code: string; description: string | null; type: CouponType; value: number; product_id: string | null; product_ids: string[]; min_order: number; starts_at: string | null; ends_at: string | null; max_uses: number | null; uses_count: number; max_uses_per_customer: number | null; first_order_only: boolean; is_active: boolean }

function statusOf(c: Coupon) {
  const now = Date.now();
  if (!c.is_active) return { label: "Pausado", tone: "neutral" as const };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "Expirado", tone: "red" as const };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Agendado", tone: "blue" as const };
  if (c.max_uses && c.uses_count >= c.max_uses) return { label: "Esgotado", tone: "mustard" as const };
  return { label: "Ativo", tone: "green" as const };
}

export function CouponsManager({ coupons, products, discountTotals, tz }: { coupons: Coupon[]; products: { id: string; name: string }[]; discountTotals: Record<string, number>; tz: string }) {
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const describe = (c: Coupon) => (c.type === "percent" ? `${Number(c.value)}% off` : c.type === "fixed" ? `${money(c.value)} off` : c.type === "free_delivery" ? "Entrega grátis" : `Grátis: ${products.find((p) => p.id === c.product_id)?.name ?? "produto"}`);
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo cupom</Button></div>
      {coupons.length === 0 ? <EmptyState icon="tag" title="Nenhum cupom" description="Crie cupons como LEVI10 (10% acima de R$ 30) ou PRIMEIRA (primeira compra)." action={<Button variant="primary" onClick={() => setEditing("new")}>Criar cupom</Button>} /> : (
        <Table>
          <thead><tr><Th>Código</Th><Th>Benefício</Th><Th>Regras</Th><Th align="right">Usos</Th><Th align="right">Desconto dado</Th><Th>Situação</Th><Th /></tr></thead>
          <tbody>
            {coupons.map((c) => {
              const st = statusOf(c);
              return (
                <tr key={c.id}>
                  <Td><button type="button" className="font-mono font-semibold hover:text-ember-600" onClick={() => { void navigator.clipboard.writeText(c.code); toast.success("Código copiado"); }}>{c.code}</button>{c.description && <span className="block text-xs text-muted">{c.description}</span>}</Td>
                  <Td>{describe(c)}</Td>
                  <Td className="text-xs text-muted">{[Number(c.min_order) > 0 && `mín. ${money(c.min_order)}`, c.first_order_only && "1ª compra", c.max_uses_per_customer && `${c.max_uses_per_customer}x por cliente`, c.product_ids.length > 0 && `${c.product_ids.length} produto(s)`, c.ends_at && `até ${date(c.ends_at, tz)}`].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td align="right" className="num">{c.uses_count}{c.max_uses ? `/${c.max_uses}` : ""}</Td>
                  <Td align="right" className="num">{money(discountTotals[c.id] ?? 0)}</Td>
                  <Td><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Switch size="sm" checked={c.is_active} label="Ativo" onChange={(v) => run(() => saveCouponAction({ ...c, starts_at: c.starts_at, ends_at: c.ends_at, is_active: v }, c.id), { success: v ? "Cupom ativado" : "Cupom pausado" })} />
                      <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(c)} />
                      <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir ${c.code}?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteCouponAction(c.id), { success: "Cupom excluído" }); }} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <CouponSheet value={editing} products={products} onClose={() => setEditing(null)} />
    </>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

function CouponSheet({ value, products, onClose }: { value: Coupon | "new" | null; products: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const blank = { code: "", description: "", type: "percent" as CouponType, value: 10, product_id: "", product_ids: [] as string[], min_order: 0, starts_at: "", ends_at: "", max_uses: "", max_uses_per_customer: "", first_order_only: false, is_active: true };
  const [f, setF] = useState(blank);
  const [restrict, setRestrict] = useState(false);
  useEffect(() => {
    if (value && value !== "new") {
      setF({ code: value.code, description: value.description ?? "", type: value.type, value: Number(value.value), product_id: value.product_id ?? "", product_ids: value.product_ids, min_order: Number(value.min_order), starts_at: toLocal(value.starts_at), ends_at: toLocal(value.ends_at), max_uses: value.max_uses?.toString() ?? "", max_uses_per_customer: value.max_uses_per_customer?.toString() ?? "", first_order_only: value.first_order_only, is_active: value.is_active });
      setRestrict(value.product_ids.length > 0);
    } else {
      setF(blank);
      setRestrict(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const save = () =>
    run(() => saveCouponAction({ ...f, value: f.type === "free_delivery" || f.type === "free_product" ? 0 : f.value, product_id: f.type === "free_product" ? f.product_id || null : null, product_ids: restrict ? f.product_ids : [], max_uses: f.max_uses ? Number(f.max_uses) : null, max_uses_per_customer: f.max_uses_per_customer ? Number(f.max_uses_per_customer) : null }, value && value !== "new" ? value.id : null), { success: "Cupom salvo", onSuccess: onClose });
  return (
    <Sheet open={Boolean(value)} onClose={onClose} width="md" mobile="full" title={value === "new" ? "Novo cupom" : "Editar cupom"} footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={save}>Salvar</Button></div>}>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código" required><Input className="font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="LEVI10" /></Field>
          <Field label="Tipo"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CouponType })}>{Object.entries(COUPON_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        {f.type === "percent" && <Field label="Percentual"><Input type="number" min={1} max={100} value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} suffix="%" /></Field>}
        {f.type === "fixed" && <Field label="Valor do desconto"><MoneyInput value={f.value} onChange={(v) => setF({ ...f, value: v ?? 0 })} /></Field>}
        {f.type === "free_product" && <Field label="Produto grátis" help="O cliente precisa ter o produto no carrinho"><Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Selecione…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
        <Field label="Descrição interna"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Campanha Instagram outubro" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pedido mínimo"><MoneyInput value={f.min_order} onChange={(v) => setF({ ...f, min_order: v ?? 0 })} /></Field>
          <Field label="Limite total de usos" help="Vazio = ilimitado"><Input type="number" min={1} value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></Field>
          <Field label="Início"><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
          <Field label="Fim"><Input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
          <Field label="Usos por cliente" help="Pelo telefone. Vazio = ilimitado"><Input type="number" min={1} value={f.max_uses_per_customer} onChange={(e) => setF({ ...f, max_uses_per_customer: e.target.value })} /></Field>
        </div>
        <Checkbox checked={f.first_order_only} onChange={(v) => setF({ ...f, first_order_only: v })} label="Somente primeira compra" description="Bloqueia telefones que já pediram antes" />
        <Checkbox checked={restrict} onChange={setRestrict} label="Vale só para alguns produtos" description="O desconto incide apenas sobre esses itens" />
        {restrict && (
          <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
            {products.map((p) => <Checkbox key={p.id} checked={f.product_ids.includes(p.id)} onChange={(v) => setF({ ...f, product_ids: v ? [...f.product_ids, p.id] : f.product_ids.filter((x) => x !== p.id) })} label={p.name} />)}
          </div>
        )}
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Ativo <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></label>
      </div>
    </Sheet>
  );
}
