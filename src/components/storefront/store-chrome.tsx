"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { Portal, useEscape, useScrollLock } from "@/components/ui/portal";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";
import { CartView } from "./cart-view";
import { ProductCustomizer } from "./product-customizer";

function ProductOverlay() {
  const { editing, closeProduct, add, update, sf } = useCart();
  const toast = useToast();
  const open = Boolean(editing);
  useScrollLock(open);
  useEscape(open, closeProduct);
  useEffect(() => {
    if (!editing) return;
    const url = new URL(window.location.href);
    url.searchParams.set("produto", editing.product.id);
    window.history.replaceState(null, "", url.toString());
    return () => {
      const u = new URL(window.location.href);
      u.searchParams.delete("produto");
      window.history.replaceState(null, "", u.toString());
    };
  }, [editing]);
  if (!editing) return null;
  const blocked = !sf.status.is_open && !sf.org.allow_scheduling;
  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={editing.product.name}>
        <div className="absolute inset-0 animate-fade-in bg-char-950/50" onClick={closeProduct} />
        <div className="relative flex max-h-[94dvh] w-full max-w-[560px] animate-slide-up flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop md:max-h-[88dvh] md:animate-pop-in md:rounded-2xl">
          <button type="button" onClick={closeProduct} aria-label="Fechar" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-ink shadow-pop">
            <Icon name="x" size={18} />
          </button>
          <div className="thin-scroll flex-1 overflow-y-auto">
            <ProductCustomizer
              product={editing.product}
              initial={editing.item}
              submitLabel={editing.item ? "Salvar alterações" : "Adicionar ao carrinho"}
              disabled={blocked}
              disabledReason="Loja fechada"
              onSubmit={(item) => {
                if (editing.item) update(item);
                else add(item);
                closeProduct();
                toast.success(editing.item ? "Item atualizado" : `${item.quantity}x ${item.name} no carrinho`);
              }}
            />
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function CartBar() {
  const { count, subtotal, setDrawerOpen, sf, ready } = useCart();
  if (!ready || !count) return null;
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
      <div className="mx-auto max-w-[560px]">
        <Link
          href={`/${sf.org.slug}/carrinho`}
          onClick={(e: MouseEvent) => {
            if (window.matchMedia("(min-width: 768px)").matches) {
              e.preventDefault();
              setDrawerOpen(true);
            }
          }}
          className="pointer-events-auto flex h-14 animate-pop-in items-center justify-between gap-3 rounded-xl bg-brand-2 px-4 text-brand-2-ink shadow-pop"
        >
          <span className="flex items-center gap-2.5">
            <span className="relative">
              <Icon name="bag" size={20} />
              <span className="num absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">{count}</span>
            </span>
            <span className="text-[14px] font-bold uppercase tracking-wide">Ver carrinho</span>
          </span>
          <span className="num text-[15px] font-bold">{count} {count === 1 ? "item" : "itens"} · {money(subtotal)}</span>
        </Link>
      </div>
    </div>
  );
}

export function StoreChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { drawerOpen, setDrawerOpen } = useCart();
  const hideBar = /\/(carrinho|checkout|pedido)(\/|$)/.test(pathname);
  return (
    <>
      <div className={cn(!hideBar && "pb-24")}>{children}</div>
      {!hideBar && <CartBar />}
      <ProductOverlay />
      <Sheet open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Seu pedido" width="md">
        <CartView onNavigate={() => setDrawerOpen(false)} />
      </Sheet>
    </>
  );
}
