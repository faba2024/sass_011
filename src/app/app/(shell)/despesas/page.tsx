import { PeriodPicker } from "@/components/app/period-picker";
import { resolvePeriod } from "@/lib/period";
import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ExpensesManager, type Expense } from "./expenses-manager";

export const metadata = { title: "Despesas" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requirePage("finance.view", "financeiro");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.de || sp.ate ? sp : { de: undefined, ate: undefined }, ctx.org.timezone);
  const supabase = await createClient();
  const [{ data }, { data: suppliers }, { data: overdue }] = await Promise.all([
    supabase.from("expenses").select("id, category, description, amount, due_date, status, paid_at, recurrence, supplier_id, notes").eq("organization_id", ctx.org.id).is("deleted_at", null).gte("due_date", from).lte("due_date", to).order("due_date"),
    supabase.from("suppliers").select("id, name").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("expenses").select("id, category, description, amount, due_date, status, paid_at, recurrence, supplier_id, notes").eq("organization_id", ctx.org.id).is("deleted_at", null).eq("status", "pending").lt("due_date", from).order("due_date"),
  ]);
  return (
    <>
      <PageHeader title="Despesas" description="Contas fixas e variáveis. Despesa paga entra automaticamente no financeiro; recorrentes geram a próxima sozinhas." />
      <div className="mb-4"><PeriodPicker from={from} to={to} /></div>
      <ExpensesManager expenses={(data ?? []) as Expense[]} overdue={(overdue ?? []) as Expense[]} suppliers={suppliers ?? []} canManage={ctx.permissions.has("finance.manage")} />
    </>
  );
}
