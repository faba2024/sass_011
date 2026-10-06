"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { saveRow, softDelete } from "@/lib/crud";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z
  .object({
    name: zText(1, 60, "Informe o nome do grupo"),
    description: zOptText(160),
    kind: z.enum(["variation", "addon", "removal"]),
    min_select: z.coerce.number().int().min(0).max(20),
    max_select: z.coerce.number().int().min(1).max(30),
    options: z
      .array(
        z.object({
          id: zId.optional().nullable(),
          name: zText(1, 60, "Informe o nome de todas as opções"),
          price_delta: z.coerce.number().min(0).max(10000),
          max_quantity: z.coerce.number().int().min(1).max(20),
          is_default: z.boolean(),
          is_active: z.boolean(),
          recipe: z.array(z.object({ ingredient_id: zId, quantity: z.coerce.number().refine((v) => v !== 0, "Quantidade da ficha não pode ser zero") })).max(20).nullable(),
        }),
      )
      .min(1, "Adicione pelo menos uma opção")
      .max(40),
    product_ids: z.array(zId).max(300),
  })
  .refine((d) => d.min_select <= d.max_select, { message: "O mínimo não pode ser maior que o máximo" });

export type GroupInput = z.input<typeof schema>;

export async function saveGroupAction(input: GroupInput, id?: string | null) {
  return run(async () => {
    const d = schema.parse(input);
    if (d.kind === "variation" && d.min_select > 0 && d.options.filter((o) => o.is_active).length < d.min_select) fail("Opções ativas insuficientes para o mínimo exigido");
    const { options, product_ids, ...row } = d;
    const { id: groupId, ctx, supabase } = await saveRow("modifier_groups", "menu.manage", row, id ? zId.parse(id) : null);
    const org = ctx.org.id;
    const { data: existing } = await supabase.from("modifiers").select("id").eq("group_id", groupId).is("deleted_at", null);
    const keep = new Set(options.map((o) => o.id).filter(Boolean));
    const removed = (existing ?? []).map((m: { id: string }) => m.id).filter((x: string) => !keep.has(x));
    if (removed.length) must(await supabase.from("modifiers").update({ deleted_at: new Date().toISOString() }).in("id", removed).eq("organization_id", org));

    for (const [i, o] of options.entries()) {
      const payload = { name: o.name, price_delta: o.price_delta, max_quantity: o.max_quantity, is_default: o.is_default, is_active: o.is_active, sort: i + 1 };
      let modId = o.id ?? null;
      if (modId) must(await supabase.from("modifiers").update(payload).eq("id", modId).eq("organization_id", org));
      else modId = (must(await supabase.from("modifiers").insert({ ...payload, organization_id: org, group_id: groupId }).select("id").single()) as { id: string }).id;
      if (o.recipe && ctx.permissions.has("inventory.manage")) {
        must(await supabase.from("modifier_recipes").delete().eq("modifier_id", modId).eq("organization_id", org));
        if (o.recipe.length) must(await supabase.from("modifier_recipes").insert(o.recipe.map((r) => ({ organization_id: org, modifier_id: modId, ingredient_id: r.ingredient_id, quantity: r.quantity }))));
      }
    }

    const { data: links } = await supabase.from("product_modifier_groups").select("product_id, sort").eq("group_id", groupId);
    const oldSort = new Map((links ?? []).map((l: { product_id: string; sort: number }) => [l.product_id, l.sort]));
    must(await supabase.from("product_modifier_groups").delete().eq("group_id", groupId).eq("organization_id", org));
    if (product_ids.length) must(await supabase.from("product_modifier_groups").insert(product_ids.map((p) => ({ organization_id: org, product_id: p, group_id: groupId, sort: oldSort.get(p) ?? 50 }))));
    revalidatePath("/app/adicionais");
    return groupId;
  });
}

export async function deleteGroupAction(id: string) {
  return run(async () => {
    const r = await softDelete("modifier_groups", "menu.manage", zId.parse(id), "/app/adicionais");
    return r;
  });
}
