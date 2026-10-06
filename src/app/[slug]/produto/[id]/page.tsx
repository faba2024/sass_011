import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/storefront";
import { ProductPage } from "./product-page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const sf = await getStorefront(slug).catch(() => null);
  const p = sf?.products.find((x) => x.id === id);
  if (!p) return {};
  return { title: p.name, description: p.description ?? undefined, openGraph: { images: p.images[0] && !p.images[0].endsWith(".svg") ? [p.images[0]] : undefined } };
}

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const sf = await getStorefront(slug);
  if (!sf?.products.some((p) => p.id === id)) notFound();
  return <ProductPage productId={id} />;
}
