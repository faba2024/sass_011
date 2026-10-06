import { StoreMenu } from "@/components/storefront/store-menu";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  return <StoreMenu initialProductId={produto} />;
}
