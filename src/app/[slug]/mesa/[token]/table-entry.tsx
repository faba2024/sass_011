"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCart } from "@/components/storefront/cart-context";
import { Spinner } from "@/components/ui/spinner";

/** QR Code da mesa: guarda a mesa no carrinho e abre o cardápio já identificado */
export function TableEntry({ token, label }: { token: string; label: string }) {
  const { setTable, sf, ready } = useCart();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    setTable({ token, label });
    const t = setTimeout(() => router.replace(`/${sf.org.slug}`), 50);
    return () => clearTimeout(t);
  }, [ready, token, label, setTable, router, sf.org.slug]);
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div>
        <Spinner size={26} className="mx-auto text-brand" />
        <p className="mt-3 font-display text-xl font-bold">{label}</p>
        <p className="text-sm text-muted">Abrindo o cardápio da {sf.org.name}…</p>
      </div>
    </div>
  );
}
