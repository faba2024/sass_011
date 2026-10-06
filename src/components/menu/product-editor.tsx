"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { saveProductAction, type ProductInput } from "@/app/app/(shell)/produtos/actions";
import type { AdminProduct, EditorData } from "@/app/app/(shell)/produtos/data";
import { useApp } from "@/components/app/app-context";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { uploadOrgImage } from "@/components/ui/image-upload";
import { Sheet } from "@/components/ui/sheet";
import { Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/hooks/use-action";
import { MODIFIER_KIND } from "@/lib/constants";
import { money, number, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "dados" | "fotos" | "opcoes" | "ficha" | "combo";
interface ComboGroupDraft { name: string; min_qty: number; max_qty: number; options: { product_id: string; price_delta: number }[] }

function blank(type: "simple" | "combo", categoryId: string | null): ProductInput {
  return {
    type, category_id: categoryId, name: "", description: "", ingredients_text: "", price: 0, promo_price: null, prep_minutes: 15,
    is_active: true, is_available: true, is_featured: false, auto_disable_on_stockout: true, images: [], group_ids: [], recipe: [], combo_groups: type === "combo" ? [] : null,
  };
}

function fromProduct(p: AdminProduct): ProductInput {
  return {
    type: p.type, category_id: p.category_id, name: p.name, description: p.description ?? "", ingredients_text: p.ingredients_text ?? "",
    price: Number(p.price), promo_price: p.promo_price != null ? Number(p.promo_price) : null, prep_minutes: p.prep_minutes,
    is_active: p.is_active, is_available: p.is_available, is_featured: p.is_featured, auto_disable_on_stockout: p.auto_disable_on_stockout,
    images: p.product_images.map((i) => i.url),
    group_ids: p.product_modifier_groups.map((g) => g.group_id),
    recipe: p.product_recipes.map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) })),
    combo_groups: p.type === "combo" ? p.combo_groups.map((g) => ({ name: g.name, min_qty: g.min_qty, max_qty: g.max_qty, options: g.combo_group_options.map((o) => ({ product_id: o.product_id, price_delta: Number(o.price_delta) })) })) : null,
  };
}

export function ProductEditor({ open, onClose, product, data, type = "simple" }: { open: boolean; onClose: () => void; product: AdminProduct | null; data: EditorData; type?: "simple" | "combo" }) {
  const { org, can } = useApp();
  const toast = useToast();
  const { run, pending } = useAction();
  const [tab, setTab] = useState<Tab>("dados");
  const [f, setF] = useState<ProductInput>(() => blank(type, data.categories[0]?.id ?? null));
  const [uploading, setUploading] = useState(false);
  const canRecipe = can("inventory.manage");

  useEffect(() => {
    if (!open) return;
    setTab("dados");
    setF(product ? fromProduct(product) : blank(type, data.categories.find((c) => /combo/i.test(c.name) && type === "combo")?.id ?? data.categories[0]?.id ?? null));
  }, [open, product, type, data.categories]);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const recipe = useMemo(() => f.recipe ?? [], [f.recipe]);
  const cost = useMemo(() => recipe.reduce((a, r) => a + Number(r.quantity || 0) * Number(data.ingredients.find((i) => i.id === r.ingredient_id)?.cost_per_unit ?? 0), 0), [recipe, data.ingredients]);
  const sale = f.promo_price ?? Number(f.price ?? 0);
  const isCombo = f.type === "combo";
  const simpleProducts = data.products.filter((p) => p.type === "simple");

  const save = () =>
    run(() => saveProductAction({ ...f, recipe: canRecipe ? recipe.filter((r) => r.ingredient_id) : null, combo_groups: f.combo_groups ? (f.combo_groups as ComboGroupDraft[]).map((g) => ({ ...g, options: g.options.filter((o) => o.product_id) })) : null }, product?.id), {
      success: product ? "Produto atualizado" : "Produto criado",
      onSuccess: onClose,
    });

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "dados", label: "Dados" },
    { value: "fotos", label: "Fotos", count: f.images.length },
    ...(isCombo ? [{ value: "combo" as Tab, label: "Etapas do combo", count: f.combo_groups?.length ?? 0 }] : []),
    { value: "opcoes", label: "Opções e adicionais", count: f.group_ids.length },
    ...(can("inventory.view") ? [{ value: "ficha" as Tab, label: "Ficha técnica", count: recipe.length }] : []),
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="lg"
      mobile="full"
      title={product ? `Editar ${isCombo ? "combo" : "produto"}` : isCombo ? "Novo combo" : "Novo produto"}
      footer={
        <div className="flex items-center gap-2">
          <span className="num mr-auto text-[13px] text-muted">{money(sale)}{canRecipe && cost > 0 ? ` · custo ${money(cost)} · margem ${percent(sale ? ((sale - cost) / sale) * 100 : 0)}` : ""}</span>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" loading={pending} disabled={uploading} onClick={save}>Salvar</Button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 bg-surface px-5 pt-2">
        <Tabs value={tab} onChange={setTab} items={tabs} />
      </div>
      <div className="space-y-4 p-5">
        {tab === "dados" && (
          <>
            <Field label="Nome" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={isCombo ? "Ex.: Combo Levi" : "Ex.: Levi Especial"} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoria">
                <Select value={f.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)}>
                  <option value="">Sem categoria (não aparece no cardápio)</option>
                  {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Tempo de preparo" hint="minutos"><Input type="number" min={0} max={240} value={f.prep_minutes ?? ""} onChange={(e) => set("prep_minutes", e.target.value ? Number(e.target.value) : null)} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço" required><MoneyInput value={Number(f.price ?? 0)} onChange={(v) => set("price", v ?? 0)} /></Field>
              <Field label="Preço promocional" help="Deixe vazio para não usar"><MoneyInput value={f.promo_price ?? null} onChange={(v) => set("promo_price", v)} /></Field>
            </div>
            <Field label="Descrição" help="Desperte a fome: o que faz esse produto especial?"><Textarea rows={3} maxLength={600} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
            {!isCombo && <Field label="Ingredientes (texto para o cliente)"><Textarea rows={2} maxLength={400} value={f.ingredients_text ?? ""} onChange={(e) => set("ingredients_text", e.target.value)} placeholder="Pão brioche, blend 180 g, cheddar, bacon…" /></Field>}
            <div className="divide-y divide-line rounded-lg border border-line">
              {(
                [
                  ["is_active", "Ativo", "Aparece no cardápio e no PDV"],
                  ["is_available", "Disponível", "Desligue para marcar como esgotado"],
                  ["is_featured", "Destaque", "Aparece no topo do cardápio"],
                  ["auto_disable_on_stockout", "Esgotar automaticamente", "Fica indisponível quando faltar insumo da ficha técnica"],
                ] as const
              ).map(([k, label, hint]) => (
                <label key={k} className="flex items-center justify-between gap-4 px-3.5 py-3">
                  <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
                  <Switch checked={Boolean(f[k])} onChange={(v) => set(k, v)} />
                </label>
              ))}
            </div>
            {product && !product.is_available && product.unavailable_reason === "stock" && <Notice tone="warn">Indisponível automaticamente por falta de insumo. Faça uma entrada no estoque para liberar.</Notice>}
          </>
        )}

        {tab === "fotos" && (
          <>
            <p className="text-[13px] text-muted">Envie fotos em alta resolução (até 8). Convertemos para WebP e o cardápio entrega o tamanho certo para cada tela. A primeira é a capa.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {f.images.map((url, i) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-sunken">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-2 top-2 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Capa</span>}
                  <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                    <div className="flex gap-1">
                      <IconButton icon="chevron-left" label="Mover para a esquerda" size="xs" variant="secondary" disabled={i === 0} onClick={() => { const a = [...f.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("images", a); }} />
                      <IconButton icon="chevron-right" label="Mover para a direita" size="xs" variant="secondary" disabled={i === f.images.length - 1} onClick={() => { const a = [...f.images]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set("images", a); }} />
                    </div>
                    <IconButton icon="trash" label="Remover foto" size="xs" variant="secondary" className="text-ketchup-500" onClick={() => set("images", f.images.filter((_, j) => j !== i))} />
                  </div>
                </div>
              ))}
              {f.images.length < 8 && (
                <label className={cn("flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-muted hover:border-ember-400 hover:text-ink", uploading && "pointer-events-none opacity-60")}>
                  <Icon name={uploading ? "refresh" : "upload"} size={20} className={uploading ? "animate-spin" : ""} />
                  <span className="text-xs font-medium">{uploading ? "Enviando…" : "Adicionar fotos"}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from((e.target.files ?? []) as ArrayLike<File>).slice(0, 8 - f.images.length);
                      if (!files.length) return;
                      setUploading(true);
                      try {
                        const urls: string[] = [];
                        for (const file of files) urls.push(await uploadOrgImage(org.id, "products", file));
                        setF((x) => ({ ...x, images: [...x.images, ...urls] }));
                      } catch (err) {
                        toast.error("Falha no envio", (err as Error).message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </>
        )}

        {tab === "combo" && isCombo && <ComboStepsEditor value={(f.combo_groups ?? []) as ComboGroupDraft[]} onChange={(v) => set("combo_groups", v)} products={simpleProducts} />}

        {tab === "opcoes" && (
          <>
            <p className="text-[13px] text-muted">Marque os grupos que este {isCombo ? "combo" : "produto"} usa (tamanho, carnes, pão, ponto, retirar ingredientes, adicionais…). Crie e edite grupos em <Link href="/app/adicionais" className="font-medium text-ember-600 hover:underline">Adicionais e variações</Link>.</p>
            {data.groups.length === 0 ? (
              <Notice tone="info">Nenhum grupo criado ainda.</Notice>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.groups.map((g) => {
                  const idx = f.group_ids.indexOf(g.id);
                  const on = idx >= 0;
                  return (
                    <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Checkbox
                        className="flex-1"
                        checked={on}
                        onChange={(v) => set("group_ids", v ? [...f.group_ids, g.id] : f.group_ids.filter((x) => x !== g.id))}
                        label={g.name}
                        description={`${MODIFIER_KIND[g.kind as keyof typeof MODIFIER_KIND]?.label ?? g.kind} · ${g.min_select > 0 ? `obrigatório (${g.min_select}–${g.max_select})` : `opcional (até ${g.max_select})`} · ${g.options} opções`}
                      />
                      {on && (
                        <div className="flex gap-0.5">
                          <IconButton icon="chevron-up" label="Subir" size="xs" disabled={idx === 0} onClick={() => { const a = [...f.group_ids]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; set("group_ids", a); }} />
                          <IconButton icon="chevron-down" label="Descer" size="xs" disabled={idx === f.group_ids.length - 1} onClick={() => { const a = [...f.group_ids]; [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]]; set("group_ids", a); }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "ficha" && (
          <>
            <p className="text-[13px] text-muted">Ingredientes consumidos por <b>1 unidade</b>. A cada pedido confirmado o estoque é baixado automaticamente e o custo abaixo alimenta a margem e o financeiro.</p>
            {!canRecipe && <Notice tone="info">Somente leitura: sua função não edita o estoque.</Notice>}
            {data.ingredients.length === 0 ? (
              <Notice tone="info">Cadastre ingredientes em <Link href="/app/estoque" className="font-medium underline">Estoque</Link> para montar a ficha técnica.</Notice>
            ) : (
              <div className="space-y-2">
                {recipe.map((r, i) => {
                  const ing = data.ingredients.find((x) => x.id === r.ingredient_id);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                      <Select disabled={!canRecipe} value={r.ingredient_id} onChange={(e) => set("recipe", recipe.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}>
                        <option value="">Ingrediente…</option>
                        {data.ingredients.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                      </Select>
                      <Input disabled={!canRecipe} type="number" step="0.001" min="0" value={r.quantity || ""} onChange={(e) => set("recipe", recipe.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} suffix={ing?.unit} />
                      <IconButton disabled={!canRecipe} icon="trash" label="Remover" className="text-ketchup-500" onClick={() => set("recipe", recipe.filter((_, j) => j !== i))} />
                    </div>
                  );
                })}
                {canRecipe && <Button size="sm" icon="plus" onClick={() => set("recipe", [...recipe, { ingredient_id: "", quantity: 0 }])}>Adicionar ingrediente</Button>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
              <div className="bg-surface p-3"><p className="text-xs text-muted">Custo</p><p className="num font-display text-lg font-semibold">{money(cost)}</p></div>
              <div className="bg-surface p-3"><p className="text-xs text-muted">Venda</p><p className="num font-display text-lg font-semibold">{money(sale)}</p></div>
              <div className="bg-surface p-3"><p className="text-xs text-muted">Margem</p><p className={cn("num font-display text-lg font-semibold", sale - cost < 0 ? "text-ketchup-500" : "text-pickle-700")}>{money(sale - cost)}</p><p className="num text-xs text-muted">{percent(sale ? ((sale - cost) / sale) * 100 : 0)}</p></div>
            </div>
            {recipe.length > 0 && (
              <ul className="space-y-1 text-xs text-muted">
                {recipe.filter((r) => r.ingredient_id).map((r, i) => {
                  const ing = data.ingredients.find((x) => x.id === r.ingredient_id);
                  return <li key={i} className="flex justify-between"><span>{number(r.quantity)} {ing?.unit} {ing?.name}</span><span className="num">{money(Number(r.quantity) * Number(ing?.cost_per_unit ?? 0))}</span></li>;
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function ComboStepsEditor({ value, onChange, products }: { value: ComboGroupDraft[]; onChange: (v: ComboGroupDraft[]) => void; products: AdminProduct[] }) {
  const update = (i: number, patch: Partial<ComboGroupDraft>) => onChange(value.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">Cada etapa é uma escolha do cliente (ex.: “Escolha seu burger”, “Escolha a bebida”). O preço do combo já inclui a opção base; use o acréscimo para opções premium.</p>
      {value.map((g, i) => (
        <div key={i} className="rounded-lg border border-line bg-paper p-3.5">
          <div className="grid gap-3 sm:grid-cols-[1fr_90px_90px_auto]">
            <Field label={`Etapa ${i + 1}`}><Input value={g.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Escolha a bebida" /></Field>
            <Field label="Mín."><Input type="number" min={0} max={10} value={g.min_qty} onChange={(e) => update(i, { min_qty: Number(e.target.value) })} /></Field>
            <Field label="Máx."><Input type="number" min={1} max={10} value={g.max_qty} onChange={(e) => update(i, { max_qty: Number(e.target.value) })} /></Field>
            <div className="flex items-end"><IconButton icon="trash" label="Remover etapa" className="text-ketchup-500" onClick={() => onChange(value.filter((_, j) => j !== i))} /></div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {g.options.map((o, j) => (
              <li key={j} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                <Select value={o.product_id} onChange={(e) => update(i, { options: g.options.map((x, k) => (k === j ? { ...x, product_id: e.target.value } : x)) })}>
                  <option value="">Produto…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <MoneyInput value={o.price_delta} onChange={(v) => update(i, { options: g.options.map((x, k) => (k === j ? { ...x, price_delta: v ?? 0 } : x)) })} />
                <IconButton icon="x" label="Remover opção" onClick={() => update(i, { options: g.options.filter((_, k) => k !== j) })} />
              </li>
            ))}
          </ul>
          <Button size="xs" icon="plus" className="mt-2" onClick={() => update(i, { options: [...g.options, { product_id: "", price_delta: 0 }] })}>Opção</Button>
        </div>
      ))}
      <Button icon="plus" onClick={() => onChange([...value, { name: "", min_qty: 1, max_qty: 1, options: [] }])}>Adicionar etapa</Button>
    </div>
  );
}
