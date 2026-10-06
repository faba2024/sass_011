"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { money } from "@/lib/format";
import { deleteRewardAction, saveProgramAction, saveRewardAction } from "./actions";

type Reward = { id: string; name: string; points_cost: number; reward_type: "product" | "discount"; product_id: string | null; discount_value: number | null; is_active: boolean };

export function LoyaltyManager({ program, rewards, products, top, stats }: { program: { is_enabled: boolean; points_per_real: number; rules_text: string | null }; rewards: Reward[]; products: { id: string; name: string }[]; top: { customer_id: string; points_balance: number; lifetime_points: number; customer: { name: string; phone: string | null } | null }[]; stats: { earned: number; redeemed: number } }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [p, setP] = useState({ is_enabled: program.is_enabled, points_per_real: Number(program.points_per_real), rules_text: program.rules_text ?? "" });
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Regras" actions={<Switch checked={p.is_enabled} label="Programa ativo" onChange={(v) => setP({ ...p, is_enabled: v })} tone="pickle" />} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pontos por R$ 1,00" help={`Pedido de R$ 50 = ${Math.floor(50 * p.points_per_real)} pontos (taxa de entrega não conta)`}><Input type="number" step="0.1" min={0.1} value={p.points_per_real} onChange={(e) => setP({ ...p, points_per_real: Number(e.target.value) })} /></Field>
            <div className="rounded-lg bg-paper p-3 text-[13px]"><p className="text-muted">Últimos 30 dias</p><p><b className="num">{stats.earned}</b> pontos ganhos · <b className="num">{stats.redeemed}</b> resgatados</p></div>
            <Field label="Texto para o cliente" className="sm:col-span-2"><Textarea rows={2} value={p.rules_text} onChange={(e) => setP({ ...p, rules_text: e.target.value })} placeholder="A cada R$ 1 você ganha 1 ponto…" /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="dark" loading={pending} onClick={() => run(() => saveProgramAction(p), { success: "Programa salvo" })}>Salvar regras</Button></div>
        </Card>
        <Card>
          <CardHeader title="Recompensas" actions={<Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>Nova</Button>} />
          {rewards.length === 0 ? <p className="text-[13px] text-muted">Crie recompensas como “100 pontos = batata grátis”.</p> : (
            <ul className="divide-y divide-line">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="num w-20 font-display text-lg font-bold">{r.points_cost}<span className="text-xs font-normal text-muted"> pts</span></span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{r.name}</span><span className="block text-xs text-muted">{r.reward_type === "product" ? `Produto: ${products.find((x) => x.id === r.product_id)?.name ?? "—"}` : `Desconto de ${money(r.discount_value)}`}</span></span>
                  {!r.is_active && <Badge>Inativa</Badge>}
                  <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(r)} />
                  <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir "${r.name}"?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteRewardAction(r.id), { success: "Recompensa excluída" }); }} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">O resgate é feito pela equipe na ficha do cliente (Clientes → cliente → Fidelidade).</p>
        </Card>
      </div>
      <Card>
        <CardHeader title="Maiores saldos" />
        {top.length === 0 ? <p className="text-[13px] text-muted">Ninguém pontuou ainda.</p> : (
          <ol className="space-y-2">
            {top.map((t, i) => (
              <li key={t.customer_id} className="flex items-center gap-3 text-[13px]">
                <span className="num w-5 text-faint">{i + 1}</span>
                <Link href={`/app/clientes/${t.customer_id}`} className="flex-1 truncate font-medium hover:text-ember-600">{t.customer?.name}</Link>
                <span className="num font-semibold">{t.points_balance} pts</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <RewardModal value={editing} products={products} onClose={() => setEditing(null)} />
    </div>
  );
}

function RewardModal({ value, products, onClose }: { value: Reward | "new" | null; products: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", points_cost: 100, reward_type: "product" as "product" | "discount", product_id: "", discount_value: null as number | null, is_active: true });
  useEffect(() => {
    if (value && value !== "new") setF({ name: value.name, points_cost: value.points_cost, reward_type: value.reward_type, product_id: value.product_id ?? "", discount_value: value.discount_value != null ? Number(value.discount_value) : null, is_active: value.is_active });
    else setF({ name: "", points_cost: 100, reward_type: "product", product_id: "", discount_value: null, is_active: true });
  }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Nova recompensa" : "Editar recompensa"} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveRewardAction({ ...f, product_id: f.reward_type === "product" ? f.product_id || null : null, discount_value: f.reward_type === "discount" ? f.discount_value : null }, value && value !== "new" ? value.id : null), { success: "Recompensa salva", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Batata frita grátis" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo em pontos"><Input type="number" min={1} value={f.points_cost} onChange={(e) => setF({ ...f, points_cost: Number(e.target.value) })} /></Field>
          <Field label="Tipo"><Select value={f.reward_type} onChange={(e) => setF({ ...f, reward_type: e.target.value as "product" | "discount" })}><option value="product">Produto grátis</option><option value="discount">Desconto (R$)</option></Select></Field>
        </div>
        {f.reward_type === "product" ? (
          <Field label="Produto"><Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Selecione…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        ) : (
          <Field label="Valor do desconto"><MoneyInput value={f.discount_value} onChange={(v) => setF({ ...f, discount_value: v })} /></Field>
        )}
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Ativa <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></label>
      </div>
    </Modal>
  );
}
