import { PageHeader } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { InvoicesView, type InvoiceRow } from "./invoices-view";

export const metadata = { title: "Assinaturas e faturas" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("subscription_payments")
    .select("id, amount, due_date, status, paid_at, method, organization:organizations(id, name, slug)")
    .order("due_date", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Assinaturas e faturas" description="Mensalidades geradas, pagas e em atraso. A baixa ativa a assinatura e estende o período em 1 mês." />
      <InvoicesView rows={(data ?? []) as unknown as InvoiceRow[]} status={status ?? ""} />
    </>
  );
}
