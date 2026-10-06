"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, softDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z
  .object({
    type: z.enum(["simple", "combo"]),
    category_id: zId.nullable(),
    name: zText(1, 80, "Informe o nome do produto"),
    description: zOptText(600),
    ingredients_text: zOptText(400),
    price: z.coerce.number({ invalid_type_error: "Informe o preço" }).min(0).max(100000),
    promo_price: z.coerce.number().min(0).nullable(),
    prep_minutes: z.coerce.number().int().min(0).max(240).nullable(),
    is_active: z.boolean(),
    is_available: z.boolean(),
    is_featured: z.boolean(),
    auto_disable_on_stockout: z.boolean(),
    images: z.array(z.string().min(1).max(1000)).max(8),
    group_ids: z.array(zId).max(20),
    recipe: z.array(z.object({ ingredient_id: zId, quantity: z.coerce.number().positive("Quantidade inválida na ficha técnica") })).max(60).nullable(),
    combo_groups: z
      .array(
        z.object({
          name: zText(1, 60, "Nome da etapa do combo"),
          min_qty: z.coerce.number().int().min(0).max(10),
          max_qty: z.coerce.number().int().min(1).max(10),
          options: z.array(z.object({ product_id: zId, price_delta: z.coerce.number().min(0) })).min(1, "Cada etapa do combo precisa de pelo menos uma opção"),
        }),
      )
      .max(10)
      .nullable(),
  })
  .refine((d) => d.promo_price == null || d.promo_price < d.price, { message: "O preço promocional deve ser menor que o preço normal" })
  .refine((d) => !d.combo_groups || d.combo_groups.every((g) => g.min_qty <= g.max_qty), { message: "Em cada etapa, o mínimo não pode ser maior que o máximo" });

export type ProductInput = z.input<typeof schema>;

export async function saveProductAction(input: ProductInput, id?: string | null) {
  return run(async () => {
    const d = schema.parse(input);
    if (d.type === "combo" && (!d.combo_groups || d.combo_groups.length === 0)) fail("Adicione pelo menos uma etapa ao combo");
    const { images, group_ids, recipe, combo_groups, ...row } = d;
    const { id: productId, ctx, supabase } = await saveRow(
      "products",
      "menu.manage",
      { ...row, unavailable_reason: row.is_available ? null : "manual" },
      id ? zId.parse(id) : null,
    );
    const org = ctx.org.id;

    must(await supabase.from("product_images").delete().eq("product_id", productId).eq("organization_id", org));
    if (images.length) must(await supabase.from("product_images").insert(images.map((url, i) => ({ organization_id: org, product_id: productId, url, sort: i }))));

    must(await supabase.from("product_modifier_groups").delete().eq("product_id", productId).eq("organization_id", org));
    if (group_ids.length) must(await supabase.from("product_modifier_groups").insert(group_ids.map((g, i) => ({ organization_id: org, product_id: productId, group_id: g, sort: i }))));

    if (recipe && ctx.permissions.has("inventory.manage")) {
      const merged = new Map<string, number>();
      recipe.forEach((r) => merged.set(r.ingredient_id, (merged.get(r.ingredient_id) ?? 0) + r.quantity));
      must(await supabase.from("product_recipes").delete().eq("product_id", productId).eq("organization_id", org));
      if (merged.size) must(await supabase.from("product_recipes").insert([...merged].map(([ingredient_id, quantity]) => ({ organization_id: org, product_id: productId, ingredient_id, quantity }))));
    }

    if (d.type === "combo" && combo_groups) {
      must(await supabase.from("combo_groups").delete().eq("combo_product_id", productId).eq("organization_id", org));
      for (const [i, g] of combo_groups.entries()) {
        const cg = must(await supabase.from("combo_groups").insert({ organization_id: org, combo_product_id: productId, name: g.name, min_qty: g.min_qty, max_qty: g.max_qty, sort: i }).select("id").single()) as { id: string };
        must(await supabase.from("combo_group_options").insert(g.options.map((o, j) => ({ organization_id: org, combo_group_id: cg.id, product_id: o.product_id, price_delta: o.price_delta, sort: j }))));
      }
    }
    revalidatePath("/app/produtos");
    revalidatePath("/app/combos");
    revalidatePath("/app/cardapio");
    return productId;
  });
}

export async function setProductFlagsAction(id: string, flags: { is_available?: boolean; is_active?: boolean; is_featured?: boolean }) {
  return run(async () => {
    const ctx = await requireAction("menu.manage");
    const supabase = await createClient();
    const patch: Record<string, unknown> = { ...flags };
    if (flags.is_available !== undefined) patch.unavailable_reason = flags.is_available ? null : "manual";
    must(await supabase.from("products").update(patch).eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/produtos");
    revalidatePath("/app/cardapio");
    return true;
  });
}

export async function deleteProductAction(id: string) {
  return run(async () => {
    const ok = await softDelete("products", "menu.manage", zId.parse(id));
    revalidatePath("/app/produtos");
    revalidatePath("/app/combos");
    return ok;
  });
}

export async function duplicateProductAction(id: string) {
  return run(async () => {
    const ctx = await requireAction("menu.manage");
    const supabase = await createClient();
    const p = must(await supabase.from("products").select("*, product_images(url, sort), product_modifier_groups(group_id, sort), product_recipes(ingredient_id, quantity)").eq("id", zId.parse(id)).eq("organization_id", ctx.org.id).single()) as Record<string, any>;
    const { id: _id, created_at: _c, updated_at: _u, product_images, product_modifier_groups, product_recipes, ...rest } = p;
    void _id; void _c; void _u;
    const copy = must(await supabase.from("products").insert({ ...rest, name: `${rest.name} (cópia)`.slice(0, 80), is_active: false }).select("id").single()) as { id: string };
    if (product_images?.length) must(await supabase.from("product_images").insert(product_images.map((i: any) => ({ organization_id: ctx.org.id, product_id: copy.id, url: i.url, sort: i.sort }))));
    if (product_modifier_groups?.length) must(await supabase.from("product_modifier_groups").insert(product_modifier_groups.map((g: any) => ({ organization_id: ctx.org.id, product_id: copy.id, group_id: g.group_id, sort: g.sort }))));
    if (product_recipes?.length && ctx.permissions.has("inventory.manage")) must(await supabase.from("product_recipes").insert(product_recipes.map((r: any) => ({ organization_id: ctx.org.id, product_id: copy.id, ingredient_id: r.ingredient_id, quantity: r.quantity }))));
    revalidatePath("/app/produtos");
    return copy.id;
  });
}
