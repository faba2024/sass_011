"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteProductAction, duplicateProductAction, setProductFlagsAction } from "@/app/app/(shell)/produtos/actions";
import type { AdminProduct, EditorData } from "@/app/app/(shell)/produtos/data";
import { useApp } from "@/components/app/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";
import { Photo } from "@/components/ui/photo";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { downloadCSV } from "@/lib/csv";
import { money, percent } from "@/lib/format";
import { ProductEditor } from "./product-editor";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ProductsList({ data, type }: { data: EditorData; type: "simple" | "combo" }) {
  const { can } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const { run } = useAction();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const manage = can("menu.manage");

  useEffect(() => {
    const id = sp.get("editar");
    if (id) {
      const p = data.products.find((x) => x.id === id);
      if (p) setEditing(p);
    } else if (sp.get("novo") === "1" && manage) setEditing("new");
  }, [sp, data.products, manage]);

  const list = useMemo(
    () =>
      data.products
        .filter((p) => p.type === type)
        .filter((p) => !q || norm(p.name).includes(norm(q)))
        .filter((p) => !cat || p.category_id === cat)
        .filter((p) => !status || (status === "active" ? p.is_active : status === "inactive" ? !p.is_active : status === "soldout" ? !p.is_available : p.is_featured)),
    [data.products, type, q, cat, status],
  );
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  const close = () => {
    setEditing(null);
    if (sp.get("editar") || sp.get("novo")) router.replace(type === "combo" ? "/app/combos" : "/app/produtos");
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64"><Input icon="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-[calc(50%-4px)] sm:w-48">
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="soldout">Esgotados</option>
            <option value="featured">Destaques</option>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button icon="download" onClick={() => downloadCSV(type === "combo" ? "combos" : "produtos", list.map((p) => ({ nome: p.name, categoria: catName(p.category_id), preco: p.price, promo: p.promo_price ?? "", custo: data.costs[p.id]?.cost ?? "", margem: data.costs[p.id]?.margin_pct ?? "", ativo: p.is_active ? "sim" : "não", disponivel: p.is_available ? "sim" : "não" })), [
            { key: "nome", label: "Produto" }, { key: "categoria", label: "Categoria" }, { key: "preco", label: "Preço" }, { key: "promo", label: "Promoção" }, { key: "custo", label: "Custo" }, { key: "margem", label: "Margem %" }, { key: "ativo", label: "Ativo" }, { key: "disponivel", label: "Disponível" },
          ])}>Exportar</Button>
          {manage && <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>{type === "combo" ? "Novo combo" : "Novo produto"}</Button>}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={type === "combo" ? "combo" : "burger"} title={type === "combo" ? "Nenhum combo encontrado" : "Nenhum produto encontrado"} description={type === "combo" ? "Monte combos com etapas de escolha: burger + acompanhamento + bebida." : "Cadastre seus burgers com fotos, variações e ficha técnica."} action={manage && <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Cadastrar</Button>} />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2 min-[1920px]:grid-cols-3">
          {list.map((p) => {
            const c = data.costs[p.id];
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5 shadow-card">
                <button type="button" onClick={() => setEditing(p)} className="shrink-0" aria-label={`Editar ${p.name}`}>
                  <Photo src={p.product_images[0]?.url} alt={p.name} sizes="64px" className="h-16 w-16" />
                </button>
                <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">{catName(p.category_id)}</p>
                  <p className="num mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                    {p.promo_price != null ? <><span className="text-muted line-through">{money(p.price)}</span><b className="text-pickle-700">{money(p.promo_price)}</b></> : <b>{money(p.price)}</b>}
                    {c && Number(c.cost) > 0 && <span className="text-xs text-muted">custo {money(c.cost)} · margem {percent(c.margin_pct)}</span>}
                  </p>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex gap-1">
                    {!p.is_active && <Badge>Inativo</Badge>}
                    {p.is_featured && <Badge tone="mustard">Destaque</Badge>}
                    {!p.is_available && <Badge tone="red">{p.unavailable_reason === "stock" ? "Sem estoque" : "Esgotado"}</Badge>}
                  </div>
                  {manage && (
                    <div className="flex items-center gap-1">
                      <Switch size="sm" checked={p.is_available} label="Disponível" onChange={(v) => run(() => setProductFlagsAction(p.id, { is_available: v }), { success: v ? `${p.name} disponível` : `${p.name} esgotado` })} />
                      <Menu
                        items={[
                          { label: "Editar", icon: "edit", onSelect: () => setEditing(p) },
                          { label: p.is_active ? "Desativar" : "Ativar", icon: p.is_active ? "eye-off" : "eye", onSelect: () => run(() => setProductFlagsAction(p.id, { is_active: !p.is_active }), { success: "Produto atualizado" }) },
                          { label: p.is_featured ? "Tirar dos destaques" : "Destacar", icon: "star", onSelect: () => run(() => setProductFlagsAction(p.id, { is_featured: !p.is_featured }), { success: "Produto atualizado" }) },
                          { label: "Duplicar", icon: "copy", onSelect: () => run(() => duplicateProductAction(p.id), { success: "Cópia criada (inativa)" }) },
                          "divider",
                          { label: "Excluir", icon: "trash", danger: true, onSelect: async () => { if (await confirm({ title: `Excluir "${p.name}"?`, description: "Some do cardápio e do PDV. Pedidos antigos continuam com o histórico.", tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteProductAction(p.id), { success: "Produto excluído" }); } },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ProductEditor open={Boolean(editing)} onClose={close} product={editing && editing !== "new" ? editing : null} data={data} type={type} />
    </>
  );
}
