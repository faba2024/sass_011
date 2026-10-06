import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InventoryManager, type Ingredient, type Movement } from "./inventory-manager";

export const metadata = { title: "Estoque" };

export default async function InventoryPage() {
  const ctx = await requirePage("inventory.view", "estoque");
  const supabase = await createClient();
  const [{ data: ings }, { data: moves }, { data: suppliers }, { data: recipes }, { data: costs }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit, stock_qty, min_qty, cost_per_unit, supplier_id, is_active").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("inventory_movements").select("id, ingredient_id, type, quantity, unit_cost, order_id, notes, occurred_at, created_at, supplier_id, created_by").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(300),
    supabase.from("suppliers").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("product_recipes").select("ingredient_id, quantity, product:products(id, name, is_available, deleted_at)").eq("organization_id", ctx.org.id),
    supabase.from("product_costs").select("product_id, name, type, sale_price, cost, margin, margin_pct, recipe_items").eq("organization_id", ctx.org.id).order("margin_pct"),
  ]);
  const creatorIds = [...new Set((moves ?? []).map((m: { created_by: string | null }) => m.created_by).filter(Boolean))] as string[];
  const { data: people } = creatorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", creatorIds) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p.full_name ?? p.email ?? ""]));
  return (
    <>
      <PageHeader title="Estoque" description="Insumos, entradas, perdas e inventário. A venda baixa o estoque sozinha pela ficha técnica." />
      <InventoryManager
        ingredients={(ings ?? []) as Ingredient[]}
        movements={((moves ?? []) as unknown as Movement[]).map((m) => ({ ...m, author: m.created_by ? names[m.created_by] ?? null : null }))}
        suppliers={suppliers ?? []}
        recipes={((recipes ?? []) as unknown as { ingredient_id: string; quantity: number; product: { id: string; name: string; is_available: boolean; deleted_at: string | null } | null }[]).filter((r) => r.product && !r.product.deleted_at)}
        costs={(costs ?? []) as { product_id: string; name: string; type: string; sale_price: number; cost: number; margin: number; margin_pct: number; recipe_items: number }[]}
        canManage={ctx.permissions.has("inventory.manage")}
        tz={ctx.org.timezone}
      />
    </>
  );
}
