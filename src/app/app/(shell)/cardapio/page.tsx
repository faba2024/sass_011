import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { loadEditorData } from "../produtos/data";
import { MenuOverview } from "./menu-overview";

export const metadata = { title: "Cardápio" };

export default async function MenuPage() {
  const ctx = await requirePage("menu.view");
  const data = await loadEditorData(ctx);
  return (
    <>
      <PageHeader
        title="Cardápio"
        description="Visão do que o cliente vê. Marque esgotado com um toque durante o serviço."
        actions={ctx.permissions.has("menu.manage") && (
          <>
            <LinkButton href="/app/categorias" size="sm" icon="folders">Categorias</LinkButton>
            <LinkButton href="/app/produtos?novo=1" size="sm" variant="primary" icon="plus">Produto</LinkButton>
          </>
        )}
      />
      <MenuOverview data={data} slug={ctx.org.slug} />
    </>
  );
}
