"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, softDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zText } from "@/lib/zod-helpers";

const ingSchema = z.object({
  name: zText(1, 80, "Informe o nome do insumo"),
  unit: z.enum(["un", "g", "kg", "ml", "l", "fatia", "porcao"]),
  min_qty: z.coerce.number().min(0),
  cost_per_unit: z.coerce.number().min(0),
  supplier_id: zId.nullable(),
  is_active: z.boolean(),
});

export async function saveIngredientAction(input: z.input<typeof ingSchema>, id?: string | null) {
  return run(async () => (await saveRow("ingredients", "inventory.manage", ingSchema.parse(input), id ? zId.parse(id) : null, { feature: "estoque", revalidate: "/app/estoque" })).id);
}

export async function deleteIngredientAction(id: string) {
  return run(async () => {
    const ctx = await requireAction("inventory.manage");
    const supabase = await createClient();
    const { count } = await supabase.from("product_recipes").select("id", { count: "exact", head: true }).eq("ingredient_id", zId.parse(id)).eq("organization_id", ctx.org.id);
    if (count) fail(`Este insumo está em ${count} ficha(s) técnica(s). Remova das fichas antes de excluir.`);
    return softDelete("ingredients", "inventory.manage", id, "/app/estoque");
  });
}

const movSchema = z.object({
  ingredient_id: zId,
  type: z.enum(["in", "out", "loss", "adjust"]),
  quantity: z.coerce.number().min(0, "Quantidade inválida"),
  unit_cost: z.coerce.number().min(0).nullable(),
  supplier_id: zId.nullable(),
  occurred_at: z.string().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function registerMovementAction(input: z.input<typeof movSchema>) {
  return run(async () => {
    const ctx = await requireAction("inventory.manage", "estoque");
    const d = movSchema.parse(input);
    const supabase = await createClient();
    const ing = must(await supabase.from("ingredients").select("id, stock_qty").eq("id", d.ingredient_id).eq("organization_id", ctx.org.id).single()) as { id: string; stock_qty: number };
    let qty: number;
    if (d.type === "adjust") {
      qty = Math.round((d.quantity - Number(ing.stock_qty)) * 1000) / 1000;
      if (qty === 0) fail("A contagem é igual ao saldo atual: nada a ajustar");
    } else {
      if (d.quantity <= 0) fail("Informe uma quantidade maior que zero");
      qty = d.type === "in" ? d.quantity : -d.quantity;
    }
    must(
      await supabase.from("inventory_movements").insert({
        organization_id: ctx.org.id,
        ingredient_id: d.ingredient_id,
        type: d.type,
        quantity: qty,
        unit_cost: d.type === "in" ? d.unit_cost : null,
        supplier_id: d.type === "in" ? d.supplier_id : null,
        occurred_at: d.occurred_at ? new Date(d.occurred_at).toISOString() : new Date().toISOString(),
        notes: d.notes || (d.type === "adjust" ? "Ajuste de inventário" : null),
      }),
    );
    revalidatePath("/app/estoque");
    return true;
  });
}
