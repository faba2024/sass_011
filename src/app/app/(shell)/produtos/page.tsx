import { ProductsList } from "@/components/menu/products-list";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { loadEditorData } from "./data";

export const metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const ctx = await requirePage("menu.view");
  const data = await loadEditorData(ctx);
  return (
    <>
      <PageHeader title="Produtos" description="Fotos, preços, variações, adicionais e ficha técnica de cada item." />
      <ProductsList data={data} type="simple" />
    </>
  );
}
