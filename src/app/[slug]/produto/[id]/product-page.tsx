"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/storefront/cart-context";
import { ProductCustomizer } from "@/components/storefront/product-customizer";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

export function ProductPage({ productId }: { productId: string }) {
  const { sf, add } = useCart();
  const router = useRouter();
  const toast = useToast();
  const product = sf.products.find((p) => p.id === productId)!;
  const blocked = !sf.status.is_open && !sf.org.allow_scheduling;
  return (
    <div className="mx-auto min-h-dvh max-w-[620px] bg-surface md:my-6 md:min-h-0 md:overflow-hidden md:rounded-2xl md:shadow-pop">
      <div className="absolute left-3 top-3 z-20 md:static md:p-3">
        <Link href={`/${sf.org.slug}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[13px] font-semibold shadow-pop md:shadow-none">
          <Icon name="arrow-left" size={16} /> {sf.org.name}
        </Link>
      </div>
      <ProductCustomizer
        product={product}
        submitLabel="Adicionar ao carrinho"
        disabled={blocked}
        disabledReason="Loja fechada"
        onSubmit={(item) => {
          add(item);
          toast.success(`${item.quantity}x ${item.name} no carrinho`);
          router.push(`/${sf.org.slug}`);
        }}
      />
    </div>
  );
}
