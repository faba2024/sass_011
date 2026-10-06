"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { saveRow, softDelete } from "@/lib/crud";
import { zDigits, zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z.object({
  name: zText(2, 100, "Informe o nome do fornecedor"),
  cnpj: zOptText(20),
  phone: zDigits,
  whatsapp: zDigits,
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")).transform((v) => v || null),
  products_text: zOptText(300),
  notes: zOptText(500),
});

export async function saveSupplierAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("suppliers", "inventory.manage", schema.parse(input), id ? zId.parse(id) : null, { revalidate: "/app/fornecedores" })).id);
}
export async function deleteSupplierAction(id: string) {
  return run(() => softDelete("suppliers", "inventory.manage", zId.parse(id), "/app/fornecedores"));
}
