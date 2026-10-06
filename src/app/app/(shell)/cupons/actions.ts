"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { saveRow, softDelete } from "@/lib/crud";
import { zId, zOptText } from "@/lib/zod-helpers";

const schema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Código: 3 a 30 letras/números, sem espaço"),
    description: zOptText(160),
    type: z.enum(["percent", "fixed", "free_delivery", "free_product"]),
    value: z.coerce.number().min(0),
    product_id: zId.nullable(),
    product_ids: z.array(zId).max(100),
    min_order: z.coerce.number().min(0),
    starts_at: z.string().optional().nullable().transform((v) => (v ? new Date(v).toISOString() : null)),
    ends_at: z.string().optional().nullable().transform((v) => (v ? new Date(v).toISOString() : null)),
    max_uses: z.coerce.number().int().positive().nullable(),
    max_uses_per_customer: z.coerce.number().int().positive().nullable(),
    first_order_only: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((d) => d.type !== "percent" || (d.value >= 1 && d.value <= 100), { message: "Percentual entre 1 e 100" })
  .refine((d) => d.type !== "fixed" || d.value > 0, { message: "Informe o valor do desconto" })
  .refine((d) => d.type !== "free_product" || d.product_id, { message: "Escolha o produto grátis" })
  .refine((d) => !d.starts_at || !d.ends_at || d.ends_at > d.starts_at, { message: "A data final deve ser depois da inicial" });

export async function saveCouponAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("coupons", "coupons.manage", schema.parse(input), id ? zId.parse(id) : null, { feature: "cupons", revalidate: "/app/cupons" })).id);
}
export async function deleteCouponAction(id: string) {
  return run(() => softDelete("coupons", "coupons.manage", zId.parse(id), "/app/cupons"));
}
