"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, Table, Td, Th } from "@/components/ui/layout";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { dateTime, maskPhone, phone, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addStaffAction, resetStaffPasswordAction, setRolePermissionsAction, updateStaffAction } from "./actions";

export interface Member { id: string; user_id: string; display_name: string | null; phone: string | null; is_active: boolean; last_access_at: string | null; created_at: string; role_id: string; email: string; full_name: string }
export interface Role { id: string; key: string; name: string; is_system: boolean; role_permissions: { permission_key: string }[] }
const ROLE_HINT: Record<string, string> = { owner: "Acesso total, assinatura", manager: "Tudo, menos assinatura", attendant: "Pedidos, clientes, mesas", cashier: "Caixa, PDV, pedidos", kitchen: "Tela da cozinha", driver: "Tela de entregas" };
const ENTITY: Record<string, string> = { products: "Produto", coupons: "Cupom", organization_members: "Equipe", organizations: "Configurações", cash_registers: "Caixa", expenses: "Despesa", delivery_zones: "Área de entrega", ingredients: "Insumo", loyalty_programs: "Fidelidade", subscriptions: "Assinatura" };
const ACTION: Record<string, string> = { insert: "criou", update: "alterou", delete: "excluiu" };

export function StaffManager({ members, roles, permissions, audit, me, myRole, limit, tz }: { members: Member[]; roles: Role[]; permissions: { key: string; module: string; label: string }[]; audit: { id: string; who: string; action: string; entity: string; entity_id: string | null; created_at: string }[]; me: string; myRole: string; limit: number | null; tz: string }) {
  const [tab, setTab] = useState<"equipe" | "permissoes" | "auditoria">("equipe");
  const [adding, setAdding] = useState(false);
  const [pwd, setPwd] = useState<Member | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();
  const roleOf = (id: string) => roles.find((r) => r.id === id);
  const active = members.filter((m) => m.is_active).length;
  const assignable = roles.filter((r) => r.key !== "owner" || myRole === "owner");

  return (
    <>
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "equipe", label: "Equipe", count: active }, { value: "permissoes", label: "Permissões por função" }, { value: "auditoria", label: "Auditoria" }]} />
      {tab === "equipe" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-muted">{active} ativo(s){limit ? ` de ${limit} do seu plano` : ""}</p>
            <Button variant="primary" icon="plus" className="ml-auto" disabled={limit != null && active >= limit} onClick={() => setAdding(true)}>Adicionar funcionário</Button>
          </div>
          <Table>
            <thead><tr><Th>Pessoa</Th><Th>Função</Th><Th>Telefone</Th><Th>Desde</Th><Th>Situação</Th><Th /></tr></thead>
            <tbody>
              {members.map((m) => {
                const role = roleOf(m.role_id);
                const isMe = m.user_id === me;
                const lockOwner = role?.key === "owner" && myRole !== "owner";
                return (
                  <tr key={m.id} className={cn(!m.is_active && "opacity-50")}>
                    <Td><div className="flex items-center gap-2.5"><Avatar name={m.display_name || m.full_name || m.email} size={30} /><div><p className="font-medium">{m.display_name || m.full_name || "—"}{isMe && <span className="ml-1 text-xs text-muted">(você)</span>}</p><p className="text-xs text-muted">{m.email}</p></div></div></Td>
                    <Td>
                      <Select disabled={isMe || lockOwner} value={m.role_id} onChange={(e) => { const r = roles.find((x) => x.id === e.target.value); if (r) void run(() => updateStaffAction(m.id, { role: r.key }), { success: `Função alterada para ${r.name}` }); }} className="h-8 w-40 text-[13px]">
                        {(lockOwner ? roles : assignable).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </Td>
                    <Td className="text-muted">{phone(m.phone) || "—"}</Td>
                    <Td className="text-muted">{relative(m.created_at)}</Td>
                    <Td><Badge tone={m.is_active ? "green" : "neutral"} dot>{m.is_active ? "Ativo" : "Desativado"}</Badge></Td>
                    <Td align="right">
                      {!isMe && !lockOwner && (
                        <Menu items={[
                          { label: "Trocar senha", icon: "lock", onSelect: () => setPwd(m) },
                          m.is_active
                            ? { label: "Desativar acesso", icon: "power", danger: true, onSelect: async () => { if (await confirm({ title: `Desativar ${m.display_name || m.email}?`, description: "A pessoa perde o acesso imediatamente. O histórico é mantido.", tone: "danger", confirmLabel: "Desativar" })) void run(() => updateStaffAction(m.id, { active: false }), { success: "Acesso desativado" }); } }
                            : { label: "Reativar acesso", icon: "power", onSelect: () => run(() => updateStaffAction(m.id, { active: true }), { success: "Acesso reativado" }) },
                        ]} />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {roles.map((r) => <div key={r.id} className="rounded-md border border-line bg-surface px-3 py-2"><p className="text-[13px] font-medium">{r.name}</p><p className="text-[11px] text-muted">{ROLE_HINT[r.key] ?? "Personalizada"}</p></div>)}
          </div>
        </>
      )}
      {tab === "permissoes" && <PermissionMatrix roles={roles} permissions={permissions} myRole={myRole} />}
      {tab === "auditoria" && (
        <Card padded={false}>
          {audit.length === 0 ? <p className="p-5 text-[13px] text-muted">Sem registros.</p> : (
            <ul className="divide-y divide-line">
              {audit.map((a) => <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]"><span className="flex-1"><b>{a.who}</b> {ACTION[a.action] ?? a.action} <span className="text-ink-2">{ENTITY[a.entity] ?? a.entity}</span></span><span className="text-xs text-muted">{dateTime(a.created_at, tz)}</span></li>)}
            </ul>
          )}
        </Card>
      )}
      <AddModal open={adding} roles={assignable} onClose={() => setAdding(false)} />
      <PasswordModal member={pwd} onClose={() => setPwd(null)} />
    </>
  );
}

function PermissionMatrix({ roles, permissions, myRole }: { roles: Role[]; permissions: { key: string; module: string; label: string }[]; myRole: string }) {
  const { run, pending } = useAction();
  const editable = roles.filter((r) => r.key !== "owner");
  const [state, setState] = useState<Record<string, Set<string>>>({});
  useEffect(() => setState(Object.fromEntries(roles.map((r) => [r.id, new Set(r.role_permissions.map((p) => p.permission_key))]))), [roles]);
  const modules = useMemo(() => [...new Set(permissions.map((p) => p.module))], [permissions]);
  const dirty = editable.filter((r) => { const a = state[r.id]; const b = new Set(r.role_permissions.map((p) => p.permission_key)); return a && (a.size !== b.size || [...a].some((x) => !b.has(x))); });
  return (
    <>
      <Notice className="mb-3">O dono sempre tem acesso total. Mudanças valem no próximo carregamento de tela de cada funcionário e são aplicadas também no banco de dados (RLS).</Notice>
      <div className="thin-scroll overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead><tr className="border-b border-line bg-paper"><th className="px-4 py-2.5 text-left text-xs font-medium text-muted">Permissão</th>{editable.map((r) => <th key={r.id} className="px-2 py-2.5 text-center text-xs font-medium text-muted">{r.name}</th>)}</tr></thead>
          <tbody>
            {modules.map((mod) => (
              <Fragment key={mod}>
                <tr><td colSpan={editable.length + 1} className="bg-sunken/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{mod}</td></tr>
                {permissions.filter((p) => p.module === mod).map((p) => (
                  <tr key={p.key} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{p.label}<span className="ml-2 font-mono text-[10px] text-faint">{p.key}</span></td>
                    {editable.map((r) => {
                      const on = state[r.id]?.has(p.key) ?? false;
                      const locked = p.key === "billing.view" || (r.key === "manager" && myRole !== "owner");
                      return (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <input type="checkbox" aria-label={`${r.name}: ${p.label}`} disabled={locked} checked={on} onChange={(e) => setState((s) => { const n = new Set(s[r.id]); if (e.target.checked) n.add(p.key); else n.delete(p.key); return { ...s, [r.id]: n }; })} className="h-4 w-4 accent-[var(--color-ember-500)] disabled:opacity-30" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" disabled={!dirty.length} onClick={() => setState(Object.fromEntries(roles.map((r) => [r.id, new Set(r.role_permissions.map((p) => p.permission_key))])))}>Descartar</Button>
        <Button variant="dark" disabled={!dirty.length} loading={pending} onClick={async () => { for (const r of dirty) await run(() => setRolePermissionsAction(r.id, [...state[r.id]]), { success: `Permissões de ${r.name} salvas` }); }}>Salvar permissões</Button>
      </div>
    </>
  );
}

function AddModal({ open, roles, onClose }: { open: boolean; roles: Role[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "attendant", password: "" });
  return (
    <Modal open={open} onClose={onClose} title="Adicionar funcionário" description="Cria o login com e-mail e senha. Se a pessoa já tem conta, é só vincular." footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => addStaffAction(f), { success: "Funcionário adicionado", onSuccess: () => { setF({ name: "", email: "", phone: "", role: "attendant", password: "" }); onClose(); } })}>Adicionar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-mail (login)" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Celular"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
        <Field label="Função" required><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.key}>{r.name} — {ROLE_HINT[r.key] ?? ""}</option>)}</Select></Field>
        <Field label="Senha inicial" help="Mín. 8 caracteres. Ignorada se o e-mail já tiver conta."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      {f.role === "driver" && <Notice className="mt-3">O entregador é criado automaticamente em Entregadores e acessa a tela mobile “Minhas entregas”.</Notice>}
    </Modal>
  );
}

function PasswordModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [pwd, setPwd] = useState("");
  return (
    <Modal open={Boolean(member)} onClose={onClose} title="Trocar senha" description={member?.email} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} disabled={pwd.length < 8} onClick={() => member && run(() => resetStaffPasswordAction(member.id, pwd), { success: "Senha alterada", onSuccess: () => { setPwd(""); onClose(); } })}>Salvar</Button></>}>
      <Field label="Nova senha" help="Mínimo de 8 caracteres. Passe para a pessoa por um canal seguro."><Input type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
    </Modal>
  );
}
