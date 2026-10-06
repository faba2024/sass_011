"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { reorder, saveRow, softDelete } from "@/lib/crud";
import { zId, zText } from "@/lib/zod-helpers";

const schema = z
  .object({
    name: zText(1, 80, "Informe o bairro/área"),
    zip_prefixes: z.array(z.string().regex(/^\d{2,8}$/, "Prefixo de CEP inválido (somente números)")).max(50),
    fee: z.coerce.number().min(0),
    min_order: z.coerce.number().min(0),
    eta_min: z.coerce.number().int().min(0).max(300),
    eta_max: z.coerce.number().int().min(0).max(300),
    is_active: z.boolean(),
  })
  .refine((d) => d.eta_max >= d.eta_min, { message: "Tempo máximo deve ser maior que o mínimo" });

export async function saveZoneAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("delivery_zones", "delivery.manage", schema.parse(input), id ? zId.parse(id) : null, { feature: "delivery", revalidate: "/app/delivery" })).id);
}
export async function deleteZoneAction(id: string) {
  return run(() => softDelete("delivery_zones", "delivery.manage", zId.parse(id), "/app/delivery"));
}
export async function reorderZonesAction(ids: string[]) {
  return run(() => reorder("delivery_zones", "delivery.manage", z.array(zId).parse(ids), "/app/delivery"));
}
