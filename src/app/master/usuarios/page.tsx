import { PageHeader } from "@/components/ui/layout";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsersView, type UserRow } from "./users-view";

export const metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const me = await getUser();
  const { data } = await supabase.rpc("platform_users", { p_search: q ?? null });
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Usuários" description="Todas as contas da plataforma e as empresas de cada uma." />
      <UsersView rows={(data ?? []) as UserRow[]} q={q ?? ""} meId={me?.id ?? ""} />
    </>
  );
}
