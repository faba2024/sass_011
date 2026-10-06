"use server";
import { z } from "zod";
import { fail, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { reorder, saveRow, softDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z.object({ name: zText(1, 60, "Informe o nome"), description: zOptText(200), is_active: z.boolean() });

export async function saveCategoryAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => {
    const data = schema.parse(input);
    if (!id) {
      const ctx = await requireAction("menu.manage");
      const supabase = await createClient();
      const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).is("deleted_at", null);
      return (await saveRow("categories", "menu.manage", { ...data, sort: (count ?? 0) + 1 }, null, { revalidate: "/app/categorias" })).id;
    }
    return (await saveRow("categories", "menu.manage", data, zId.parse(id), { revalidate: "/app/categorias" })).id;
  });
}

export async function deleteCategoryAction(id: string) {
  return run(async () => {
    const ctx = await requireAction("menu.manage");
    const supabase = await createClient();
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).eq("category_id", zId.parse(id)).is("deleted_at", null);
    if (count) fail(`Mova ou exclua os ${count} produto(s) desta categoria antes.`);
    return softDelete("categories", "menu.manage", id, "/app/categorias");
  });
}

export async function reorderCategoriesAction(ids: string[]) {
  return run(() => reorder("categories", "menu.manage", z.array(zId).parse(ids), "/app/categorias"));
}
