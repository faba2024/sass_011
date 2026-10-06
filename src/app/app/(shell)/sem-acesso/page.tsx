import { EmptyState } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth";

export default async function NoAccessPage() {
  const ctx = await requireOrg();
  return (
    <EmptyState
      icon="lock"
      title="Sem telas liberadas para sua função"
      description={`Sua função (${ctx.roleName}) ainda não tem permissões nesta empresa. Peça ao dono ou gerente para ajustar em Funcionários.`}
    />
  );
}
