import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoriesManager } from "./categories-manager";

export const metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const ctx = await requirePage("menu.view");
  const supabase = await createClient();
  const [{ data: cats }, { data: prods }] = await Promise.all([
    supabase.from("categories").select("id, name, description, is_active, sort").eq("organization_id", ctx.org.id).is("deleted_at", null).order("sort"),
    supabase.from("products").select("category_id").eq("organization_id", ctx.org.id).is("deleted_at", null),
  ]);
  const counts: Record<string, number> = {};
  for (const p of prods ?? []) if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Categorias" description="Organize o cardápio. A ordem aqui é a ordem que o cliente vê." />
      <CategoriesManager categories={(cats ?? []).map((c: { id: string; name: string; description: string | null; is_active: boolean; sort: number }) => ({ ...c, products: counts[c.id] ?? 0 }))} canManage={ctx.permissions.has("menu.manage")} />
    </>
  );
}
