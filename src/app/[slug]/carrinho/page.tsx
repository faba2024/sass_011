"use client";
import Link from "next/link";
import { useCart } from "@/components/storefront/cart-context";
import { CartView } from "@/components/storefront/cart-view";
import { Icon } from "@/components/ui/icons";

export default function CartPage() {
  const { sf, ready } = useCart();
  return (
    <div className="mx-auto min-h-dvh max-w-[620px] bg-surface md:my-6 md:min-h-0 md:rounded-2xl md:shadow-pop">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:rounded-t-2xl">
        <Link href={`/${sf.org.slug}`} aria-label="Voltar ao cardápio" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sunken"><Icon name="arrow-left" size={18} /></Link>
        <div>
          <h1 className="font-display text-lg font-bold leading-tight">Seu carrinho</h1>
          <p className="text-xs text-muted">{sf.org.name}</p>
        </div>
      </header>
      {ready ? <CartView /> : <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>}
    </div>
  );
}
