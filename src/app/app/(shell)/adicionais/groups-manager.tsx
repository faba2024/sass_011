"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/app-context";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Checkbox, Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { MODIFIER_KIND } from "@/lib/constants";
import { money } from "@/lib/format";
import type { ModifierKind } from "@/lib/types";
import { deleteGroupAction, saveGroupAction, type GroupInput } from "./actions";

export interface AdminGroup {
  id: string; name: string; description: string | null; kind: ModifierKind; min_select: number; max_select: number; sort: number;
  modifiers: { id: string; name: string; price_delta: number; max_quantity: number; is_default: boolean; is_active: boolean; sort: number; deleted_at: string | null; modifier_recipes: { ingredient_id: string; quantity: number }[] }[];
  product_modifier_groups: { product_id: string }[];
}

export function GroupsManager({ groups, products, ingredients }: { groups: AdminGroup[]; products: { id: string; name: string }[]; ingredients: { id: string; name: string; unit: string }[] }) {
  const { can } = useApp();
  const [editing, setEditing] = useState<AdminGroup | "new" | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();
  const manage = can("menu.manage");
  return (
    <>
      {manage && <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo grupo</Button></div>}
      {groups.length === 0 ? (
        <EmptyState icon="plus-circle" title="Nenhum grupo de opções" description="Crie “Escolha a carne” (1 obrigatória), “Retirar ingredientes” e “Adicione mais” com preços." action={manage && <Button variant="primary" onClick={() => setEditing("new")}>Criar grupo</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <article key={g.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-[15px] font-semibold">{g.name}</h3>
                  <p className="text-xs text-muted">{MODIFIER_KIND[g.kind].label} · {g.min_select > 0 ? `obrigatório, ${g.min_select === g.max_select ? `escolha ${g.min_select}` : `${g.min_select} a ${g.max_select}`}` : `opcional, até ${g.max_select}`}</p>
                </div>
                <Badge tone={g.kind === "addon" ? "ember" : g.kind === "removal" ? "red" : "blue"}>{g.product_modifier_groups.length} produto(s)</Badge>
              </div>
              <ul className="mt-3 flex-1 space-y-1 text-[13px]">
                {g.modifiers.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className={m.is_active ? "" : "text-faint line-through"}>{m.name}{m.is_default ? <span className="ml-1 text-xs text-muted">(padrão)</span> : null}</span>
                    <span className="num text-muted">{Number(m.price_delta) > 0 ? `+ ${money(m.price_delta)}` : "—"}</span>
                  </li>
                ))}
                {g.modifiers.length > 6 && <li className="text-xs text-muted">+ {g.modifiers.length - 6} opções</li>}
              </ul>
              {manage && (
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Button size="sm" icon="edit" onClick={() => setEditing(g)}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-ketchup-500" icon="trash" onClick={async () => { if (await confirm({ title: `Excluir "${g.name}"?`, description: "O grupo sai de todos os produtos. Pedidos antigos não mudam.", tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteGroupAction(g.id), { success: "Grupo excluído" }); }}>Excluir</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <GroupEditor value={editing} onClose={() => setEditing(null)} products={products} ingredients={ingredients} />
    </>
  );
}

type Opt = GroupInput["options"][number];

function GroupEditor({ value, onClose, products, ingredients }: { value: AdminGroup | "new" | null; onClose: () => void; products: { id: string; name: string }[]; ingredients: { id: string; name: string; unit: string }[] }) {
  const { can } = useApp();
  const { run, pending } = useAction();
  const [f, setF] = useState<GroupInput>({ name: "", description: "", kind: "addon", min_select: 0, max_select: 5, options: [], product_ids: [] });
  const [recipeOpen, setRecipeOpen] = useState<number | null>(null);
  const canRecipe = can("inventory.manage");

  useEffect(() => {
    if (!value) return;
    setRecipeOpen(null);
    if (value === "new") setF({ name: "", description: "", kind: "addon", min_select: 0, max_select: 5, options: [{ name: "", price_delta: 0, max_quantity: 1, is_default: false, is_active: true, recipe: [] }], product_ids: [] });
    else
      setF({
        name: value.name, description: value.description ?? "", kind: value.kind, min_select: value.min_select, max_select: value.max_select,
        options: value.modifiers.map((m) => ({ id: m.id, name: m.name, price_delta: Number(m.price_delta), max_quantity: m.max_quantity, is_default: m.is_default, is_active: m.is_active, recipe: m.modifier_recipes.map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) })) })),
        product_ids: value.product_modifier_groups.map((p) => p.product_id),
      });
  }, [value]);

  const setOpt = (i: number, patch: Partial<Opt>) => setF((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const kind = f.kind as ModifierKind;

  return (
    <Sheet
      open={Boolean(value)}
      onClose={onClose}
      width="lg"
      mobile="full"
      title={value === "new" ? "Novo grupo de opções" : "Editar grupo"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveGroupAction({ ...f, options: f.options.map((o) => ({ ...o, recipe: canRecipe ? (o.recipe ?? []).filter((r) => r.ingredient_id) : null })) }, value && value !== "new" ? value.id : null), { success: "Grupo salvo", onSuccess: onClose })}>Salvar</Button></div>}
    >
      <div className="space-y-5 p-5">
        <Field label="Tipo">
          <Segmented
            value={kind}
            onChange={(k) => setF((x) => ({ ...x, kind: k, ...(k === "variation" ? { min_select: 1, max_select: 1 } : k === "removal" ? { min_select: 0, max_select: Math.max(x.options.length, 1) } : {}) }))}
            items={[{ value: "variation", label: "Variação" }, { value: "addon", label: "Adicionais" }, { value: "removal", label: "Retirar" }]}
          />
          <p className="mt-1 text-xs text-muted">{MODIFIER_KIND[kind].hint}</p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_100px_100px]">
          <Field label="Nome do grupo" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={kind === "variation" ? "Escolha a carne" : kind === "removal" ? "Retirar ingredientes" : "Adicione mais"} /></Field>
          <Field label="Mínimo" hint={Number(f.min_select) > 0 ? "obrigatório" : "opcional"}><Input type="number" min={0} value={f.min_select} onChange={(e) => setF({ ...f, min_select: Number(e.target.value) })} /></Field>
          <Field label="Máximo" hint={Number(f.max_select) === 1 ? "escolha única" : "múltipla"}><Input type="number" min={1} value={f.max_select} onChange={(e) => setF({ ...f, max_select: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Texto de ajuda" help="Opcional, aparece para o cliente abaixo do título"><Input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Opções</p>
          <ul className="space-y-2">
            {f.options.map((o, i) => (
              <li key={o.id ?? `n${i}`} className="rounded-lg border border-line bg-paper p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_130px_90px_auto]">
                  <Input value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} placeholder={kind === "removal" ? "Sem cebola" : "Bacon extra"} />
                  <MoneyInput value={Number(o.price_delta)} onChange={(v) => setOpt(i, { price_delta: v ?? 0 })} disabled={kind === "removal"} />
                  <Input type="number" min={1} max={20} title="Quantidade máxima por pedido" value={o.max_quantity} onChange={(e) => setOpt(i, { max_quantity: Number(e.target.value) })} disabled={kind !== "addon"} suffix="máx" />
                  <div className="flex items-center gap-1">
                    <IconButton icon="chevron-up" label="Subir" size="sm" disabled={i === 0} onClick={() => setF((x) => { const a = [...x.options]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...x, options: a }; })} />
                    <IconButton icon="trash" label="Remover opção" size="sm" className="text-ketchup-500" onClick={() => setF((x) => ({ ...x, options: x.options.filter((_, j) => j !== i) }))} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px]">
                  <label className="flex items-center gap-2"><Switch size="sm" checked={o.is_active} onChange={(v) => setOpt(i, { is_active: v })} /> Ativa</label>
                  {kind === "variation" && <label className="flex items-center gap-2"><Switch size="sm" checked={o.is_default} onChange={(v) => setF((x) => ({ ...x, options: x.options.map((oo, j) => ({ ...oo, is_default: j === i ? v : Number(x.max_select) === 1 ? false : oo.is_default })) }))} /> Pré-selecionada</label>}
                  {can("inventory.view") && <button type="button" onClick={() => setRecipeOpen(recipeOpen === i ? null : i)} className="font-medium text-ember-600 hover:underline">Ficha técnica ({o.recipe?.length ?? 0})</button>}
                </div>
                {recipeOpen === i && (
                  <div className="mt-3 space-y-2 rounded-md border border-line bg-surface p-3">
                    <p className="text-xs text-muted">Insumo extra por unidade desta opção. Use valor negativo para remoções (ex.: “Sem cebola” = −20 g de cebola).</p>
                    {(o.recipe ?? []).map((r, k) => (
                      <div key={k} className="grid grid-cols-[1fr_110px_auto] gap-2">
                        <Select disabled={!canRecipe} value={r.ingredient_id} onChange={(e) => setOpt(i, { recipe: (o.recipe ?? []).map((x, kk) => (kk === k ? { ...x, ingredient_id: e.target.value } : x)) })}>
                          <option value="">Ingrediente…</option>
                          {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                        </Select>
                        <Input disabled={!canRecipe} type="number" step="0.001" value={r.quantity || ""} onChange={(e) => setOpt(i, { recipe: (o.recipe ?? []).map((x, kk) => (kk === k ? { ...x, quantity: Number(e.target.value) } : x)) })} />
                        <IconButton disabled={!canRecipe} icon="x" label="Remover" onClick={() => setOpt(i, { recipe: (o.recipe ?? []).filter((_, kk) => kk !== k) })} />
                      </div>
                    ))}
                    {canRecipe && <Button size="xs" icon="plus" onClick={() => setOpt(i, { recipe: [...(o.recipe ?? []), { ingredient_id: "", quantity: 0 }] })}>Insumo</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Button size="sm" icon="plus" className="mt-2" onClick={() => setF((x) => ({ ...x, options: [...x.options, { name: "", price_delta: 0, max_quantity: 1, is_default: false, is_active: true, recipe: [] }] }))}>Adicionar opção</Button>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Usado nos produtos</p>
          {products.length === 0 ? <Notice>Cadastre produtos primeiro.</Notice> : (
            <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
              {products.map((p) => (
                <Checkbox key={p.id} checked={f.product_ids.includes(p.id)} onChange={(v) => setF((x) => ({ ...x, product_ids: v ? [...x.product_ids, p.id] : x.product_ids.filter((y) => y !== p.id) }))} label={p.name} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
