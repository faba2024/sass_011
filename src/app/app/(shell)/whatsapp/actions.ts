"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { hardDelete, saveRow } from "@/lib/crud";
import { zId, zText } from "@/lib/zod-helpers";

const schema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z_]{3,40}$/, "Chave: letras minúsculas e _"),
  name: zText(2, 60, "Informe o nome"),
  body: zText(5, 1000, "Escreva a mensagem"),
  is_active: z.boolean(),
});

export async function saveTemplateAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("whatsapp_templates", "marketing.manage", schema.parse(input), id ? zId.parse(id) : null, { revalidate: "/app/whatsapp" })).id);
}
export async function deleteTemplateAction(id: string) {
  return run(() => hardDelete("whatsapp_templates", "marketing.manage", zId.parse(id), "/app/whatsapp"));
}
