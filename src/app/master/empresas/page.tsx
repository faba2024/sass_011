import { PageHeader } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { CompaniesView, type CompanyRow } from "./companies-view";

export const metadata = { title: "Empresas" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const [{ data: rows, error }, { data: plans }] = await Promise.all([
    supabase.rpc("platform_organizations", { p_search: q ?? null, p_status: status ?? null }),
    supabase.from("plans").select("code, name, price, is_active").order("sort"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Empresas" description="Hamburguerias cadastradas, planos e situação da assinatura." />
      <CompaniesView rows={(rows ?? []) as CompanyRow[]} plans={(plans ?? []) as { code: string; name: string; price: number; is_active: boolean }[]} q={q ?? ""} status={status ?? ""} error={error?.message ?? null} />
    </>
  );
}
