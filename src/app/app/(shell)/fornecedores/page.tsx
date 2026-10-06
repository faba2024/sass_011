import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SuppliersManager, type Supplier } from "./suppliers-manager";

export const metadata = { title: "Fornecedores" };

export default async function SuppliersPage() {
  const ctx = await requirePage("inventory.view", "estoque");
  const supabase = await createClient();
  const [{ data }, { data: ings }] = await Promise.all([
    supabase.from("suppliers").select("id, name, cnpj, phone, whatsapp, email, products_text, notes").eq("organization_id", ctx.org.id).is("deleted_at", null).order("name"),
    supabase.from("ingredients").select("supplier_id").eq("organization_id", ctx.org.id).is("deleted_at", null),
  ]);
  const counts: Record<string, number> = {};
  for (const i of ings ?? []) if (i.supplier_id) counts[i.supplier_id] = (counts[i.supplier_id] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Fornecedores" description="Contatos de quem abastece a cozinha. Vincule aos insumos e às entradas de estoque." />
      <SuppliersManager suppliers={(data ?? []) as Supplier[]} counts={counts} canManage={ctx.permissions.has("inventory.manage")} />
    </>
  );
}
