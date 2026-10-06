"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Menu } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { useAction } from "@/hooks/use-action";
import { date } from "@/lib/format";
import { sendPasswordResetAction, setPlatformAdminAction } from "../actions";

export interface UserRow { id: string; email: string; full_name: string | null; is_platform_admin: boolean; created_at: string; orgs: { id: string; name: string; role: string; active: boolean }[] }

export function UsersView({ rows, q, meId }: { rows: UserRow[]; q: string; meId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run } = useAction();
  const [search, setSearch] = useState(q);
  return (
    <>
      <form className="mb-4" onSubmit={(e) => { e.preventDefault(); router.push(search ? `/master/usuarios?q=${encodeURIComponent(search)}` : "/master/usuarios"); }}>
        <Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" className="max-w-md" />
      </form>
      <Table>
        <thead><tr><Th>Usuário</Th><Th>Empresas</Th><Th>Desde</Th><Th /></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <Td>
                <div className="flex items-center gap-2.5">
                  <Avatar name={u.full_name ?? u.email} size={30} />
                  <div className="min-w-0">
                    <p className="font-medium">{u.full_name || "—"} {u.is_platform_admin && <Badge tone="violet" className="ml-1">Admin plataforma</Badge>}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {u.orgs.length === 0 ? <span className="text-muted">nenhuma</span> : u.orgs.map((o) => <Badge key={o.id} tone={o.active ? "neutral" : "red"}>{o.name} · {o.role}</Badge>)}
                </div>
              </Td>
              <Td className="text-muted">{date(u.created_at)}</Td>
              <Td align="right">
                <Menu items={[
                  { label: "Enviar link de nova senha", icon: "send", onSelect: () => run(() => sendPasswordResetAction(u.email), { success: `Link enviado para ${u.email}`, refresh: false }) },
                  u.is_platform_admin
                    ? { label: "Remover acesso master", icon: "lock", danger: true, disabled: u.id === meId, onSelect: async () => { if (await confirm({ title: "Remover acesso de administrador?", description: `${u.email} deixa de acessar o painel master.`, tone: "danger", confirmLabel: "Remover" })) run(() => setPlatformAdminAction(u.id, false), { success: "Acesso removido" }); } }
                    : { label: "Tornar admin da plataforma", icon: "crown", onSelect: async () => { if (await confirm({ title: "Dar acesso total à plataforma?", description: `${u.email} poderá ver e alterar todas as empresas, planos e faturas.`, confirmLabel: "Dar acesso" })) run(() => setPlatformAdminAction(u.id, true), { success: "Acesso concedido" }); } },
                ]} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted">{rows.length} usuário(s){rows.length === 500 ? " — refine a busca para ver mais" : ""}</p>
    </>
  );
}
