"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { saveRow, softDelete } from "@/lib/crud";
import { zDigits, zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z.object({
  name: zText(2, 80, "Informe o nome"),
  phone: zDigits,
  vehicle: zOptText(40),
  plate: zOptText(12),
  status: z.enum(["available", "on_delivery", "offline"]),
  is_active: z.boolean(),
});

export async function saveDriverAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("drivers", "delivery.manage", schema.parse(input), id ? zId.parse(id) : null, { feature: "delivery", revalidate: "/app/entregadores" })).id);
}
export async function deleteDriverAction(id: string) {
  return run(() => softDelete("drivers", "delivery.manage", zId.parse(id), "/app/entregadores"));
}
