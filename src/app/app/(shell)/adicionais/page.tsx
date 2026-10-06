import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GroupsManager, type AdminGroup } from "./groups-manager";

export const metadata = { title: "Adicionais e variações" };

export default async function GroupsPage() {
  const ctx = await requirePage("menu.view");
  const supabase = await createClient();
  const canInv = ctx.permissions.has("inventory.view");
  const [{ data: groups }, { data: products }, { data: ingredients }] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, description, kind, min_select, max_select, sort, modifiers(id, name, price_delta, max_quantity, is_default, is_active, sort, deleted_at, modifier_recipes(ingredient_id, quantity)), product_modifier_groups(product_id)")
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null)
      .order("sort"),
    supabase.from("products").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    canInv ? supabase.from("ingredients").select("id, name, unit").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name") : Promise.resolve({ data: [] }),
  ]);
  const list = ((groups ?? []) as AdminGroup[]).map((g) => ({ ...g, modifiers: g.modifiers.filter((m) => !m.deleted_at).sort((a, b) => a.sort - b.sort) }));
  return (
    <>
      <PageHeader title="Adicionais e variações" description="Grupos reutilizáveis: tamanho, carnes, pão, ponto, retirar ingredientes e “Adicione mais”." />
      <GroupsManager groups={list} products={products ?? []} ingredients={(ingredients ?? []) as { id: string; name: string; unit: string }[]} />
    </>
  );
}
