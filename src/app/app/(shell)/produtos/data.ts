import "server-only";
import type { AuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface AdminProduct {
  id: string;
  type: "simple" | "combo";
  category_id: string | null;
  name: string;
  description: string | null;
  ingredients_text: string | null;
  price: number;
  promo_price: number | null;
  prep_minutes: number | null;
  is_active: boolean;
  is_available: boolean;
  unavailable_reason: string | null;
  is_featured: boolean;
  auto_disable_on_stockout: boolean;
  sort: number;
  product_images: { url: string; sort: number }[];
  product_modifier_groups: { group_id: string; sort: number }[];
  product_recipes: { ingredient_id: string; quantity: number }[];
  combo_groups: { id: string; name: string; min_qty: number; max_qty: number; sort: number; combo_group_options: { product_id: string; price_delta: number; sort: number }[] }[];
}
export interface EditorData {
  products: AdminProduct[];
  categories: { id: string; name: string }[];
  groups: { id: string; name: string; kind: string; min_select: number; max_select: number; options: number }[];
  ingredients: { id: string; name: string; unit: string; cost_per_unit: number }[];
  costs: Record<string, { cost: number; margin: number; margin_pct: number }>;
}

export async function loadEditorData(ctx: AuthContext): Promise<EditorData> {
  const supabase = await createClient();
  const canInv = ctx.permissions.has("inventory.view") || ctx.permissions.has("inventory.manage");
  const [{ data: products }, { data: categories }, { data: groups }, { data: ingredients }, { data: costs }] = await Promise.all([
    supabase
      .from("products")
      .select("*, product_images(url, sort), product_modifier_groups(group_id, sort), product_recipes(ingredient_id, quantity), combo_groups!combo_groups_combo_product_id_fkey(id, name, min_qty, max_qty, sort, combo_group_options(product_id, price_delta, sort))")
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null)
      .order("sort"),
    supabase.from("categories").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("sort"),
    supabase.from("modifier_groups").select("id, name, kind, min_select, max_select, modifiers(id, deleted_at)").eq("organization_id", ctx.org.id).is("deleted_at", null).order("sort"),
    canInv ? supabase.from("ingredients").select("id, name, unit, cost_per_unit").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name") : Promise.resolve({ data: [] }),
    canInv ? supabase.from("product_costs").select("product_id, cost, margin, margin_pct").eq("organization_id", ctx.org.id) : Promise.resolve({ data: [] }),
  ]);
  const sorted = ((products ?? []) as AdminProduct[]).map((p) => ({
    ...p,
    product_images: [...(p.product_images ?? [])].sort((a, b) => a.sort - b.sort),
    product_modifier_groups: [...(p.product_modifier_groups ?? [])].sort((a, b) => a.sort - b.sort),
    combo_groups: [...(p.combo_groups ?? [])].sort((a, b) => a.sort - b.sort).map((g) => ({ ...g, combo_group_options: [...g.combo_group_options].sort((a, b) => a.sort - b.sort) })),
  }));
  return {
    products: sorted,
    categories: categories ?? [],
    groups: ((groups ?? []) as { id: string; name: string; kind: string; min_select: number; max_select: number; modifiers: { id: string; deleted_at: string | null }[] }[]).map((g) => ({
      id: g.id, name: g.name, kind: g.kind, min_select: g.min_select, max_select: g.max_select, options: g.modifiers.filter((m) => !m.deleted_at).length,
    })),
    ingredients: (ingredients ?? []) as EditorData["ingredients"],
    costs: Object.fromEntries(((costs ?? []) as { product_id: string; cost: number; margin: number; margin_pct: number }[]).map((c) => [c.product_id, c])),
  };
}
