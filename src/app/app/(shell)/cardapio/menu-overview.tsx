"use client";
import Link from "next/link";
import { useApp } from "@/components/app/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/layout";
import { Photo } from "@/components/ui/photo";
import { downloadDataUrl, useQr } from "@/components/ui/qr";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useAction } from "@/hooks/use-action";
import { storeUrl } from "@/lib/env";
import { money } from "@/lib/format";
import { setProductFlagsAction } from "../produtos/actions";
import type { EditorData } from "../produtos/data";

export function MenuOverview({ data, slug }: { data: EditorData; slug: string }) {
  const { can } = useApp();
  const toast = useToast();
  const { run } = useAction();
  const url = storeUrl(slug);
  const qr = useQr(url);
  const manage = can("menu.manage");
  const uncategorized = data.products.filter((p) => !p.category_id);
  const soldOut = data.products.filter((p) => !p.is_available && p.is_active).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {data.categories.length === 0 && <EmptyState icon="menu-book" title="Cardápio vazio" description="Crie categorias e produtos para começar a vender." />}
        {data.categories.map((c) => {
          const list = data.products.filter((p) => p.category_id === c.id);
          return (
            <Card key={c.id} padded={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="font-display text-[15px] font-semibold">{c.name}</h2>
                <span className="text-xs text-muted">{list.length} item(ns)</span>
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted">Sem produtos nesta categoria.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Photo src={p.product_images[0]?.url} alt={p.name} sizes="44px" className="h-11 w-11" />
                      <Link href={`/app/${p.type === "combo" ? "combos" : "produtos"}?editar=${p.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium hover:text-ember-600">{p.name}</p>
                        <p className="num text-xs text-muted">{money(p.promo_price ?? p.price)}{p.promo_price != null && <span className="ml-1 line-through">{money(p.price)}</span>}</p>
                      </Link>
                      {!p.is_active && <Badge>Inativo</Badge>}
                      {!p.is_available && <Badge tone="red">{p.unavailable_reason === "stock" ? "Sem insumo" : "Esgotado"}</Badge>}
                      {manage && <Switch size="sm" checked={p.is_available} label="Disponível" onChange={(v) => run(() => setProductFlagsAction(p.id, { is_available: v }), { success: v ? `${p.name} disponível` : `${p.name} esgotado` })} />}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
        {uncategorized.length > 0 && (
          <Card>
            <CardHeader title="Sem categoria" description="Não aparecem no cardápio online." />
            <ul className="text-[13px]">{uncategorized.map((p) => <li key={p.id}><Link href={`/app/produtos?editar=${p.id}`} className="hover:text-ember-600">{p.name}</Link></li>)}</ul>
          </Card>
        )}
      </div>
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Link do cardápio" description="Divulgue no Instagram, WhatsApp e no balcão." />
          <div className="mx-auto w-44 rounded-lg border border-line p-2">{qr ? <img src={qr} alt="QR Code do cardápio" className="aspect-square w-full" /> : <div className="skeleton aspect-square" />}</div>
          <p className="mt-3 break-all rounded-md bg-sunken px-2.5 py-2 font-mono text-xs">{url}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" icon="copy" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Link copiado"); }}>Copiar</Button>
            <Button size="sm" icon="download" disabled={!qr} onClick={() => qr && downloadDataUrl(qr, `qr-cardapio-${slug}.png`)}>QR Code</Button>
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-md bg-ink text-[13px] font-medium text-white">Abrir cardápio</a>
        </Card>
        <Card>
          <CardHeader title="Resumo" />
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Produtos ativos</dt><dd className="num">{data.products.filter((p) => p.is_active).length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Esgotados agora</dt><dd className="num text-ketchup-500">{soldOut}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Combos</dt><dd className="num">{data.products.filter((p) => p.type === "combo").length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Sem foto</dt><dd className="num">{data.products.filter((p) => !p.product_images.length).length}</dd></div>
          </dl>
        </Card>
      </aside>
    </div>
  );
}
