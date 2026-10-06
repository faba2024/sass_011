"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Segmented, Tabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { UNITS } from "@/lib/constants";
import { downloadCSV } from "@/lib/csv";
import { dateTime, money, number, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteIngredientAction, registerMovementAction, saveIngredientAction } from "./actions";

export interface Ingredient { id: string; name: string; unit: string; stock_qty: number; min_qty: number; cost_per_unit: number; supplier_id: string | null; is_active: boolean }
export interface Movement { id: string; ingredient_id: string; type: string; quantity: number; unit_cost: number | null; order_id: string | null; notes: string | null; occurred_at: string; created_at: string; supplier_id: string | null; created_by: string | null; author?: string | null }
type Recipe = { ingredient_id: string; quantity: number; product: { id: string; name: string; is_available: boolean; deleted_at: string | null } | null };
type Cost = { product_id: string; name: string; type: string; sale_price: number; cost: number; margin: number; margin_pct: number; recipe_items: number };

const MOVE_LABEL: Record<string, { label: string; tone: "green" | "red" | "neutral" | "mustard" | "blue" | "ember" }> = {
  in: { label: "Entrada", tone: "green" },
  out: { label: "Saída", tone: "neutral" },
  loss: { label: "Perda", tone: "red" },
  adjust: { label: "Ajuste", tone: "mustard" },
  sale: { label: "Venda", tone: "blue" },
  sale_reversal: { label: "Estorno", tone: "ember" },
};

function level(i: Ingredient) {
  if (Number(i.stock_qty) <= 0) return { label: "Sem estoque", tone: "red" as const };
  if (Number(i.stock_qty) <= Number(i.min_qty)) return { label: "Baixo", tone: "mustard" as const };
  return { label: "OK", tone: "green" as const };
}

export function InventoryManager({ ingredients, movements, suppliers, recipes, costs, canManage, tz }: { ingredients: Ingredient[]; movements: Movement[]; suppliers: { id: string; name: string }[]; recipes: Recipe[]; costs: Cost[]; canManage: boolean; tz: string }) {
  const [tab, setTab] = useState<"insumos" | "movimentos" | "alertas" | "custos">("insumos");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);
  const [moving, setMoving] = useState<{ ing: Ingredient | null; type: "in" | "out" | "loss" | "adjust" } | null>(null);
  const [moveFilter, setMoveFilter] = useState("");
  const { run } = useAction();
  const confirm = useConfirm();

  const alerts = ingredients.filter((i) => i.is_active && Number(i.stock_qty) <= Number(i.min_qty));
  const productsOf = (id: string) => recipes.filter((r) => r.ingredient_id === id).map((r) => r.product!);
  const filtered = ingredients.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  const totalValue = ingredients.reduce((a, i) => a + Math.max(0, Number(i.stock_qty)) * Number(i.cost_per_unit), 0);
  const ingName = (id: string) => ingredients.find((i) => i.id === id)?.name ?? "—";
  const unitOf = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";
  const moves = movements.filter((m) => !moveFilter || m.ingredient_id === moveFilter);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-4">
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Insumos</p><p className="num font-display text-xl font-semibold">{ingredients.length}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Valor em estoque</p><p className="num font-display text-xl font-semibold">{money(totalValue)}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Abaixo do mínimo</p><p className="num font-display text-xl font-semibold text-mustard-700">{alerts.filter((a) => Number(a.stock_qty) > 0).length}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Zerados</p><p className="num font-display text-xl font-semibold text-ketchup-500">{alerts.filter((a) => Number(a.stock_qty) <= 0).length}</p></div>
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "insumos", label: "Insumos" }, { value: "alertas", label: "Alertas", count: alerts.length }, { value: "movimentos", label: "Movimentações" }, { value: "custos", label: "Custos e margens" }]} />

      {tab === "insumos" && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="w-full sm:w-64"><Input icon="search" placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button icon="download" onClick={() => downloadCSV("estoque", ingredients.map((i) => ({ ...i, unit: UNITS[i.unit] ?? i.unit, valor: (Math.max(0, Number(i.stock_qty)) * Number(i.cost_per_unit)).toFixed(2) })), [{ key: "name", label: "Insumo" }, { key: "stock_qty", label: "Saldo" }, { key: "unit", label: "Unidade" }, { key: "min_qty", label: "Mínimo" }, { key: "cost_per_unit", label: "Custo unit." }, { key: "valor", label: "Valor" }])}>Exportar</Button>
              {canManage && <Button icon="truck" onClick={() => setMoving({ ing: null, type: "in" })}>Entrada de estoque</Button>}
              {canManage && <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo insumo</Button>}
            </div>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon="boxes" title="Nenhum insumo cadastrado" description="Cadastre pão, carne, queijo, bacon, batata e bebidas para controlar o estoque pela ficha técnica." action={canManage && <Button variant="primary" onClick={() => setEditing("new")}>Cadastrar insumo</Button>} />
          ) : (
            <Table>
              <thead><tr><Th>Insumo</Th><Th align="right">Saldo</Th><Th align="right">Mínimo</Th><Th align="right">Custo unit.</Th><Th align="right">Valor</Th><Th>Situação</Th><Th>Usado em</Th><Th /></tr></thead>
              <tbody>
                {filtered.map((i) => {
                  const lv = level(i);
                  const prods = productsOf(i.id);
                  return (
                    <tr key={i.id} className={cn("hover:bg-paper", !i.is_active && "opacity-50")}>
                      <Td><span className="font-medium">{i.name}</span><span className="block text-xs text-muted">{suppliers.find((s) => s.id === i.supplier_id)?.name ?? "—"}</span></Td>
                      <Td align="right" className={cn("num font-semibold", lv.tone === "red" ? "text-ketchup-500" : lv.tone === "mustard" ? "text-mustard-700" : "")}>{number(i.stock_qty)} {i.unit}</Td>
                      <Td align="right" className="num text-muted">{number(i.min_qty)}</Td>
                      <Td align="right" className="num">{Number(i.cost_per_unit) > 0 && Number(i.cost_per_unit) < 0.1 ? `R$ ${Number(i.cost_per_unit).toFixed(4).replace(".", ",")}` : money(i.cost_per_unit)}</Td>
                      <Td align="right" className="num">{money(Math.max(0, Number(i.stock_qty)) * Number(i.cost_per_unit))}</Td>
                      <Td><Badge tone={lv.tone} dot>{lv.label}</Badge></Td>
                      <Td className="text-xs text-muted">{prods.length ? `${prods.length} produto(s)` : "—"}</Td>
                      <Td align="right">
                        {canManage && (
                          <Menu items={[
                            { label: "Entrada", icon: "plus", onSelect: () => setMoving({ ing: i, type: "in" }) },
                            { label: "Saída / uso interno", icon: "minus", onSelect: () => setMoving({ ing: i, type: "out" }) },
                            { label: "Registrar perda", icon: "alert", onSelect: () => setMoving({ ing: i, type: "loss" }) },
                            { label: "Ajuste de inventário", icon: "scale", onSelect: () => setMoving({ ing: i, type: "adjust" }) },
                            "divider",
                            { label: "Editar", icon: "edit", onSelect: () => setEditing(i) },
                            { label: "Histórico", icon: "history", onSelect: () => { setMoveFilter(i.id); setTab("movimentos"); } },
                            { label: "Excluir", icon: "trash", danger: true, onSelect: async () => { if (await confirm({ title: `Excluir ${i.name}?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteIngredientAction(i.id), { success: "Insumo excluído" }); } },
                          ]} />
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      {tab === "alertas" && (
        alerts.length === 0 ? <EmptyState icon="check-circle" title="Tudo abastecido" description="Nenhum insumo abaixo do mínimo." /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.map((i) => {
              const lv = level(i);
              const prods = productsOf(i.id);
              return (
                <article key={i.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium">{i.name}</p><p className="num text-[13px] text-muted">Saldo {number(i.stock_qty)} {i.unit} · mínimo {number(i.min_qty)} {i.unit}</p></div>
                    <Badge tone={lv.tone} dot>{lv.label}</Badge>
                  </div>
                  {prods.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted">Produtos afetados</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">{prods.map((p) => <Link key={p.id} href={`/app/produtos?editar=${p.id}`}><Badge tone={p.is_available ? "neutral" : "red"}>{p.name}{p.is_available ? "" : " · indisponível"}</Badge></Link>)}</div>
                    </div>
                  )}
                  {canManage && <Button size="sm" variant="primary" icon="plus" className="mt-3" onClick={() => setMoving({ ing: i, type: "in" })}>Registrar entrada</Button>}
                </article>
              );
            })}
          </div>
        )
      )}

      {tab === "movimentos" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64"><Select value={moveFilter} onChange={(e) => setMoveFilter(e.target.value)}><option value="">Todos os insumos</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></div>
            <Button icon="download" className="ml-auto" onClick={() => downloadCSV("movimentacoes-estoque", moves.map((m) => ({ data: new Date(m.occurred_at).toLocaleString("pt-BR"), insumo: ingName(m.ingredient_id), tipo: MOVE_LABEL[m.type]?.label, qtd: m.quantity, custo: m.unit_cost ?? "", obs: m.notes ?? "", por: m.author ?? "" })), [{ key: "data", label: "Data" }, { key: "insumo", label: "Insumo" }, { key: "tipo", label: "Tipo" }, { key: "qtd", label: "Quantidade" }, { key: "custo", label: "Custo unit." }, { key: "obs", label: "Observação" }, { key: "por", label: "Usuário" }])}>Exportar</Button>
          </div>
          {moves.length === 0 ? <EmptyState icon="history" title="Sem movimentações" /> : (
            <Table>
              <thead><tr><Th>Data</Th><Th>Insumo</Th><Th>Tipo</Th><Th align="right">Quantidade</Th><Th align="right">Custo unit.</Th><Th>Origem</Th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <Td className="text-muted">{dateTime(m.occurred_at, tz)}</Td>
                    <Td className="font-medium">{ingName(m.ingredient_id)}</Td>
                    <Td><Badge tone={MOVE_LABEL[m.type]?.tone ?? "neutral"}>{MOVE_LABEL[m.type]?.label ?? m.type}</Badge></Td>
                    <Td align="right" className={cn("num font-semibold", Number(m.quantity) < 0 ? "text-ketchup-500" : "text-pickle-700")}>{Number(m.quantity) > 0 ? "+" : ""}{number(m.quantity)} {unitOf(m.ingredient_id)}</Td>
                    <Td align="right" className="num">{m.unit_cost != null ? money(m.unit_cost) : "—"}</Td>
                    <Td className="text-xs text-muted">{m.order_id ? <Link href={`/app/pedidos/${m.order_id}`} className="text-ember-600 hover:underline">{m.notes}</Link> : m.notes ?? "—"}{m.author ? ` · ${m.author}` : ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      {tab === "custos" && (
        costs.length === 0 ? <EmptyState icon="chart" title="Sem produtos" /> : (
          <>
            <Notice className="mb-3">Custo calculado pela ficha técnica com o custo médio atual dos insumos. Combos usam a média das opções de cada etapa.</Notice>
            <Table>
              <thead><tr><Th>Produto</Th><Th align="right">Custo</Th><Th align="right">Venda</Th><Th align="right">Margem</Th><Th align="right">%</Th><Th /></tr></thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.product_id}>
                    <Td className="font-medium">{c.name}{Number(c.recipe_items) === 0 && <span className="ml-2 text-xs text-mustard-700">sem ficha técnica</span>}</Td>
                    <Td align="right" className="num">{money(c.cost)}</Td>
                    <Td align="right" className="num">{money(c.sale_price)}</Td>
                    <Td align="right" className={cn("num font-semibold", Number(c.margin) < 0 && "text-ketchup-500")}>{money(c.margin)}</Td>
                    <Td align="right" className={cn("num", Number(c.margin_pct) < 50 ? "text-mustard-700" : "text-pickle-700")}>{percent(c.margin_pct)}</Td>
                    <Td align="right"><Link href={`/app/${c.type === "combo" ? "combos" : "produtos"}?editar=${c.product_id}`} className="text-xs font-medium text-ember-600 hover:underline">Ficha técnica</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )
      )}

      <IngredientModal value={editing} suppliers={suppliers} onClose={() => setEditing(null)} />
      <MovementModal value={moving} ingredients={ingredients} suppliers={suppliers} onClose={() => setMoving(null)} />
    </>
  );
}

function IngredientModal({ value, suppliers, onClose }: { value: Ingredient | "new" | null; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", unit: "un", min_qty: 0, cost_per_unit: 0, supplier_id: "", is_active: true });
  useEffect(() => {
    if (value && value !== "new") setF({ name: value.name, unit: value.unit, min_qty: Number(value.min_qty), cost_per_unit: Number(value.cost_per_unit), supplier_id: value.supplier_id ?? "", is_active: value.is_active });
    else setF({ name: "", unit: "un", min_qty: 0, cost_per_unit: 0, supplier_id: "", is_active: true });
  }, [value]);
  const save = () => run(() => saveIngredientAction({ ...f, unit: f.unit as "un", supplier_id: f.supplier_id || null }, value && value !== "new" ? value.id : null), { success: "Insumo salvo", onSuccess: onClose });
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Novo insumo" : "Editar insumo"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={save}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Blend bovino" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unidade de controle"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{Object.entries(UNITS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}</Select></Field>
          <Field label="Estoque mínimo" hint={f.unit}><Input type="number" step="0.001" min={0} value={f.min_qty} onChange={(e) => setF({ ...f, min_qty: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Custo por ${f.unit}`} help="Atualizado automaticamente pelo custo médio das entradas"><Input type="number" step="0.0001" min={0} value={f.cost_per_unit} onChange={(e) => setF({ ...f, cost_per_unit: Number(e.target.value) })} leading="R$" /></Field>
          <Field label="Fornecedor"><Select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Ativo <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></label>
        {value === "new" && <p className="text-xs text-muted">O saldo começa em zero. Registre a primeira entrada depois de salvar.</p>}
      </div>
    </Modal>
  );
}

function MovementModal({ value, ingredients, suppliers, onClose }: { value: { ing: Ingredient | null; type: "in" | "out" | "loss" | "adjust" } | null; ingredients: Ingredient[]; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [type, setType] = useState<"in" | "out" | "loss" | "adjust">("in");
  const [ingId, setIngId] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [supplier, setSupplier] = useState("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!value) return;
    setType(value.type);
    setIngId(value.ing?.id ?? "");
    setQty("");
    setTotalCost(null);
    setSupplier(value.ing?.supplier_id ?? "");
    setWhen(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setNotes("");
  }, [value]);
  const ing = useMemo(() => ingredients.find((i) => i.id === ingId), [ingredients, ingId]);
  const unitCost = type === "in" && totalCost != null && qty ? totalCost / Number(qty) : null;
  const title = { in: "Entrada de estoque", out: "Saída / uso interno", loss: "Registrar perda", adjust: "Ajuste de inventário" }[type];
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} disabled={!ingId || qty === ""} onClick={() => run(() => registerMovementAction({ ingredient_id: ingId, type, quantity: Number(qty), unit_cost: unitCost, supplier_id: supplier || null, occurred_at: when, notes }), { success: "Movimentação registrada", onSuccess: onClose })}>Registrar</Button></>}>
      <div className="space-y-4">
        <Segmented value={type} onChange={setType} items={[{ value: "in", label: "Entrada" }, { value: "out", label: "Saída" }, { value: "loss", label: "Perda" }, { value: "adjust", label: "Inventário" }]} />
        <Field label="Insumo" required><Select value={ingId} onChange={(e) => setIngId(e.target.value)}><option value="">Selecione…</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} — saldo {number(i.stock_qty)} {i.unit}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={type === "adjust" ? "Quantidade contada" : "Quantidade"} hint={ing?.unit} help={type === "adjust" && ing && qty !== "" ? `Diferença: ${Number(qty) - Number(ing.stock_qty) > 0 ? "+" : ""}${number(Number(qty) - Number(ing.stock_qty))} ${ing.unit}` : undefined}>
            <Input type="number" step="0.001" min={0} value={qty} onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))} />
          </Field>
          <Field label="Data"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        {type === "in" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Custo total da nota" help={unitCost != null ? `= ${unitCost.toFixed(4).replace(".", ",")} por ${ing?.unit ?? "un"}` : "Atualiza o custo médio"}><MoneyInput value={totalCost} onChange={setTotalCost} /></Field>
            <Field label="Fornecedor"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
        )}
        <Field label="Observação"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === "loss" ? "Ex.: venceu, caiu no chão…" : type === "in" ? "Nº da nota" : ""} /></Field>
      </div>
    </Modal>
  );
}
