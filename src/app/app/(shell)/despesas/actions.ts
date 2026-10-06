"use server";
import { z } from "zod";
import { run } from "@/lib/action";
import { saveRow, softDelete } from "@/lib/crud";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z.object({
  category: z.enum(["aluguel", "energia", "agua", "funcionarios", "fornecedores", "marketing", "impostos", "manutencao", "outras"]),
  description: zText(2, 120, "Descreva a despesa"),
  amount: z.coerce.number().positive("Informe o valor"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento"),
  status: z.enum(["pending", "paid"]),
  paid_at: z.string().optional().nullable().transform((v) => (v ? new Date(v).toISOString() : null)),
  recurrence: z.enum(["none", "weekly", "monthly"]),
  supplier_id: zId.nullable(),
  notes: zOptText(500),
});

export async function saveExpenseAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => {
    const d = schema.parse(input);
    return (await saveRow("expenses", "finance.manage", { ...d, paid_at: d.status === "paid" ? d.paid_at ?? new Date().toISOString() : null }, id ? zId.parse(id) : null, { feature: "financeiro", revalidate: "/app/despesas" })).id;
  });
}

export async function setExpensePaidAction(id: string, paid: boolean) {
  return run(async () => (await saveRow("expenses", "finance.manage", { status: paid ? "paid" : "pending", paid_at: paid ? new Date().toISOString() : null }, zId.parse(id), { revalidate: "/app/despesas" })).id);
}

export async function deleteExpenseAction(id: string) {
  return run(() => softDelete("expenses", "finance.manage", zId.parse(id), "/app/despesas"));
}
