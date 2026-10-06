import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { CartProvider } from "@/components/storefront/cart-context";
import { StoreChrome } from "@/components/storefront/store-chrome";
import { getStorefront } from "@/lib/storefront";
import { readableOn, shade } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sf = await getStorefront(slug).catch(() => null);
  if (!sf) return { title: "Loja não encontrada" };
  return {
    title: { default: `${sf.org.name} — Cardápio e pedidos online`, template: `%s · ${sf.org.name}` },
    description: sf.org.description ?? `Peça online na ${sf.org.name}: entrega, retirada ou no local.`,
    openGraph: { title: sf.org.name, description: sf.org.description ?? undefined, images: sf.org.banner_url && !sf.org.banner_url.endsWith(".svg") ? [sf.org.banner_url] : undefined },
    icons: sf.org.logo_url ? { icon: sf.org.logo_url } : undefined,
  };
}

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) notFound();
  const sf = await getStorefront(slug);
  if (!sf) notFound();
  const brand = sf.org.primary_color;
  const style = {
    "--brand": brand,
    "--brand-ink": readableOn(brand),
    "--brand-soft": shade(brand, 0.88),
    "--brand-2": sf.org.secondary_color,
    "--brand-2-ink": readableOn(sf.org.secondary_color),
  } as CSSProperties;
  return (
    <div style={style} className="min-h-dvh bg-paper">
      <CartProvider sf={sf}>
        <StoreChrome>{children}</StoreChrome>
      </CartProvider>
    </div>
  );
}
