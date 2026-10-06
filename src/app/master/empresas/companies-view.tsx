"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Notice } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { useAction } from "@/hooks/use-action";
import { SUBSCRIPTION_STATUS } from "@/lib/constants";
import { storeUrl } from "@/lib/env";
import { date, integer, localDateISO, money, relative, slugify } from "@/lib/format";
import type { SubscriptionStatus } from "@/lib/types";
import { createCompanyAction, createInvoiceAction, openCompanyPanelAction, setCompanyStatusAction, setCustomDomainAction, updateSubscriptionAction } from "../actions";

export interface CompanyRow {
  id: string; name: string; slug: string; status: "active" | "suspended" | "cancelled"; custom_domain: string | null; created_at: string;
  plan_code: string | null; plan_name: string | null; sub_status: SubscriptionStatus | null; sub_price: number | null; trial_ends_at: string | null; current_period_end: string | null;
  owner_name: string | null; owner_email: string | null; members: number; products: number; orders_30d: number; gmv_30d: number; last_order_at: string | null;
}
type Plan = { code: string; name: string; price: number; is_active: boolean };

const ORG_STATUS = { active: { label: "Ativa", tone: "green" }, suspended: { label: "Suspensa", tone: "red" }, cancelled: { label: "Cancelada", tone: "neutral" } } as const;

export function CompaniesView({ rows, plans, q, status, error }: { rows: CompanyRow[]; plans: Plan[]; q: string; status: string; error: string | null }) {
  const router = useRouter();
  const { run } = useAction();
  const confirm = useConfirm();
  const [search, setSearch] = useState(q);
  const [creating, setCreating] = useState(false);
  const [subFor, setSubFor] = useState<CompanyRow | null>(null);
  const [domainFor, setDomainFor] = useState<CompanyRow | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<CompanyRow | null>(null);

  const go = (next: { q?: string; status?: string }) => {
    const p = new URLSearchParams();
    const qq = next.q ?? search;
    const st = next.status ?? status;
    if (qq) p.set("q", qq);
    if (st) p.set("status", st);
    router.push(`/master/empresas${p.size ? `?${p}` : ""}`);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex-1" onSubmit={(e) => { e.preventDefault(); go({ q: search }); }}>
          <Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, endereço ou e-mail do dono" className="max-w-md" />
        </form>
        <Select value={status} onChange={(e) => go({ status: e.target.value })} className="w-auto">
          <option value="">Todas</option>
          <option value="active">Ativas</option>
          <option value="trialing">Em trial</option>
          <option value="past_due">Inadimplentes</option>
          <option value="pending">Trial expirado</option>
          <option value="suspended">Suspensas</option>
          <option value="cancelled">Canceladas</option>
        </Select>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Nova empresa</Button>
      </div>
      {error && <Notice tone="error" className="mb-4">{error}</Notice>}
      {rows.length === 0 ? (
        <EmptyState icon="building" title="Nenhuma empresa encontrada" description="Ajuste a busca ou cadastre uma nova hamburgueria." />
      ) : (
        <Table>
          <thead>
            <tr><Th>Empresa</Th><Th>Plano</Th><Th>Assinatura</Th><Th align="right">Pedidos 30d</Th><Th align="right">Vendido 30d</Th><Th>Último pedido</Th><Th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = r.sub_status ? SUBSCRIPTION_STATUS[r.sub_status] : null;
              return (
                <tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-2"><span className="font-medium">{r.name}</span>{r.status !== "active" && <Badge tone={ORG_STATUS[r.status].tone}>{ORG_STATUS[r.status].label}</Badge>}</div>
                    <p className="text-xs text-muted">/{r.slug}{r.custom_domain ? ` · ${r.custom_domain}` : ""} · {r.owner_email ?? "sem dono"}</p>
                  </Td>
                  <Td><span className="font-medium">{r.plan_name ?? "—"}</span><p className="num text-xs text-muted">{r.sub_price != null ? `${money(r.sub_price)}/mês` : ""}</p></Td>
                  <Td>
                    {st && <Badge tone={st.tone} dot>{st.label}</Badge>}
                    <p className="text-xs text-muted">{r.sub_status === "trialing" && r.trial_ends_at ? `até ${date(r.trial_ends_at)}` : r.current_period_end ? `vence ${date(r.current_period_end)}` : ""}</p>
                  </Td>
                  <Td align="right" className="num">{integer(r.orders_30d)}</Td>
                  <Td align="right" className="num">{money(r.gmv_30d)}</Td>
                  <Td className="text-muted">{r.last_order_at ? relative(r.last_order_at) : "nunca"}</Td>
                  <Td align="right">
                    <Menu
                      items={[
                        { label: "Abrir painel da empresa", icon: "external", onSelect: () => run(() => openCompanyPanelAction(r.id), { refresh: false, onSuccess: () => router.push("/app") }) },
                        { label: "Ver cardápio online", icon: "store", onSelect: () => window.open(storeUrl(r.slug), "_blank") },
                        "divider",
                        { label: "Plano e assinatura", icon: "layers", onSelect: () => setSubFor(r) },
                        { label: "Gerar fatura", icon: "receipt", onSelect: () => setInvoiceFor(r) },
                        { label: "Domínio próprio", icon: "link", onSelect: () => setDomainFor(r) },
                        "divider",
                        r.status === "active"
                          ? { label: "Suspender", icon: "lock", danger: true, onSelect: async () => { if (await confirm({ title: `Suspender ${r.name}?`, description: "O cardápio continua visível, mas a loja deixa de receber pedidos.", confirmLabel: "Suspender", tone: "danger" })) run(() => setCompanyStatusAction(r.id, "suspended"), { success: "Empresa suspensa" }); } }
                          : { label: "Reativar", icon: "power", onSelect: () => run(() => setCompanyStatusAction(r.id, "active"), { success: "Empresa reativada" }) },
                        ...(r.status !== "cancelled" ? [{ label: "Cancelar conta", icon: "x-circle" as const, danger: true, onSelect: async () => { if (await confirm({ title: `Cancelar a conta de ${r.name}?`, description: "O cardápio sai do ar e a assinatura é cancelada. Os dados são mantidos e a conta pode ser reativada.", confirmLabel: "Cancelar conta", tone: "danger" })) run(() => setCompanyStatusAction(r.id, "cancelled"), { success: "Conta cancelada" }); } }] : []),
                      ]}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-muted">{rows.length} empresa(s)</p>

      <CreateCompany open={creating} onClose={() => setCreating(false)} plans={plans} />
      {subFor && <SubscriptionModal row={subFor} plans={plans} onClose={() => setSubFor(null)} />}
      {domainFor && <DomainModal row={domainFor} onClose={() => setDomainFor(null)} />}
      {invoiceFor && <InvoiceModal row={invoiceFor} onClose={() => setInvoiceFor(null)} />}
    </>
  );
}

function CreateCompany({ open, onClose, plans }: { open: boolean; onClose: () => void; plans: Plan[] }) {
  const { run, pending } = useAction();
  const blank = { name: "", slug: "", owner_name: "", owner_email: "", owner_password: "", plan_code: plans.find((p) => p.is_active)?.code ?? "STARTER", status: "trialing" as SubscriptionStatus, trial_days: 15 };
  const [f, setF] = useState(blank);
  return (
    <Modal open={open} onClose={onClose} title="Nova empresa" description="Cria a hamburgueria com funções, permissões e assinatura. Se o e-mail já tiver conta, ele vira o dono." size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => createCompanyAction(f), { success: "Empresa criada", onSuccess: () => { setF(blank); onClose(); } })}>Criar empresa</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da hamburgueria" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugify(e.target.value) })} /></Field>
        <Field label="Endereço" required help={<span className="font-mono">{storeUrl(f.slug || "loja")}</span>}><Input value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Field>
        <Field label="Responsável" required><Input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
        <Field label="E-mail do responsável" required><Input type="email" value={f.owner_email} onChange={(e) => setF({ ...f, owner_email: e.target.value })} /></Field>
        <Field label="Senha inicial" help="Obrigatória para e-mail sem conta. Mínimo 8 caracteres." className="sm:col-span-2"><Input type="text" autoComplete="off" value={f.owner_password} onChange={(e) => setF({ ...f, owner_password: e.target.value })} /></Field>
        <Field label="Plano"><Select value={f.plan_code} onChange={(e) => setF({ ...f, plan_code: e.target.value })}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name} · {money(p.price)}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Situação"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SubscriptionStatus })}><option value="trialing">Trial</option><option value="active">Ativa</option></Select></Field>
          <Field label="Dias de trial"><Input type="number" min={0} max={90} value={f.trial_days} onChange={(e) => setF({ ...f, trial_days: Number(e.target.value) })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function SubscriptionModal({ row, plans, onClose }: { row: CompanyRow; plans: Plan[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ plan_code: row.plan_code ?? "STARTER", status: (row.sub_status ?? "active") as SubscriptionStatus, price: row.sub_price as number | null, trial_ends_at: row.trial_ends_at?.slice(0, 10) ?? "", period_end: row.current_period_end ?? "", notes: "" });
  return (
    <Modal open onClose={onClose} title={`Assinatura · ${row.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => updateSubscriptionAction(row.id, { ...f, trial_ends_at: f.trial_ends_at || null, period_end: f.period_end || null, notes: f.notes || null }), { success: "Assinatura atualizada", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plano"><Select value={f.plan_code} onChange={(e) => { const p = plans.find((x) => x.code === e.target.value); setF({ ...f, plan_code: e.target.value, price: p ? Number(p.price) : f.price }); }}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
        <Field label="Situação"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SubscriptionStatus })}>{Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Preço mensal" help="Permite preço negociado"><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Fim do trial"><Input type="date" value={f.trial_ends_at} onChange={(e) => setF({ ...f, trial_ends_at: e.target.value })} /></Field>
        <Field label="Fim do período pago"><Input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
        <Field label="Observação" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function DomainModal({ row, onClose }: { row: CompanyRow; onClose: () => void }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(row.custom_domain ?? "");
  return (
    <Modal open onClose={onClose} title={`Domínio próprio · ${row.name}`} description="Adicione o mesmo domínio no projeto da Vercel (Settings → Domains) e peça ao cliente o CNAME para cname.vercel-dns.com."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => setCustomDomainAction(row.id, v), { success: v ? "Domínio vinculado" : "Domínio removido", onSuccess: onClose })}>Salvar</Button></>}>
      <Field label="Domínio" help="Deixe vazio para remover"><Input value={v} onChange={(e) => setV(e.target.value)} placeholder="pedidos.hamburgueria.com.br" /></Field>
    </Modal>
  );
}

function InvoiceModal({ row, onClose }: { row: CompanyRow; onClose: () => void }) {
  const { run, pending } = useAction();
  const [due, setDue] = useState(row.current_period_end ?? localDateISO());
  const [amount, setAmount] = useState<number | null>(row.sub_price);
  return (
    <Modal open onClose={onClose} title={`Gerar fatura · ${row.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => createInvoiceAction(row.id, due, amount), { success: "Fatura gerada", onSuccess: onClose })}>Gerar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vencimento"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} /></Field>
      </div>
    </Modal>
  );
}
