import { ProductsList } from "@/components/menu/products-list";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { loadEditorData } from "../produtos/data";

export const metadata = { title: "Combos" };

export default async function CombosPage() {
  const ctx = await requirePage("menu.view");
  const data = await loadEditorData(ctx);
  return (
    <>
      <PageHeader title="Combos" description="Monte combos com etapas: o cliente escolhe o burger, o acompanhamento e a bebida." />
      <ProductsList data={data} type="combo" />
    </>
  );
}
