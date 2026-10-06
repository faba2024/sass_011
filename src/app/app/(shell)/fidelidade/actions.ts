"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, hardDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

export async function saveProgramAction(input: { is_enabled: boolean; points_per_real: number; rules_text: string }) {
  return run(async () => {
    const ctx = await requireAction("loyalty.manage", "fidelidade");
    const d = z.object({ is_enabled: z.boolean(), points_per_real: z.coerce.number().positive("Pontos por real deve ser maior que zero").max(100), rules_text: zOptText(500) }).parse(input);
    const supabase = await createClient();
    must(await supabase.from("loyalty_programs").upsert({ organization_id: ctx.org.id, ...d }, { onConflict: "organization_id" }));
    revalidatePath("/app/fidelidade");
    return true;
  });
}

const rewardSchema = z
  .object({
    name: zText(2, 80, "Informe o nome da recompensa"),
    points_cost: z.coerce.number().int().positive("Pontos inválidos"),
    reward_type: z.enum(["product", "discount"]),
    product_id: zId.nullable(),
    discount_value: z.coerce.number().positive().nullable(),
    is_active: z.boolean(),
  })
  .refine((d) => d.reward_type !== "discount" || d.discount_value, { message: "Informe o valor do desconto" });

export async function saveRewardAction(input: z.input<typeof rewardSchema>, id?: string | null) {
  return run(async () => (await saveRow("loyalty_rewards", "loyalty.manage", rewardSchema.parse(input), id ? zId.parse(id) : null, { feature: "fidelidade", revalidate: "/app/fidelidade" })).id);
}
export async function deleteRewardAction(id: string) {
  return run(() => hardDelete("loyalty_rewards", "loyalty.manage", zId.parse(id), "/app/fidelidade"));
}
