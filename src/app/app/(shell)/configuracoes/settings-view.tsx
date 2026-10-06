"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { PlanPicker, type PlanOption } from "@/components/billing/plan-picker";
import { daysLeft, trialLabel, type PlanAccess } from "@/lib/plan-access";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import { HoursEditor, type Shift } from "@/components/settings/hours-editor";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Card, Section, Table, Td, Th } from "@/components/ui/layout";
import { Notice } from "@/components/ui/states";
import { LinkTabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { SUBSCRIPTION_STATUS } from "@/lib/constants";
import { storeUrl } from "@/lib/env";
import { date, maskCep, maskCnpj, maskPhone, money } from "@/lib/format";
import type { Organization, SubscriptionStatus } from "@/lib/types";
import { readableOn } from "@/lib/utils";
import { addExceptionAction, checkSubscriptionPaymentAction, deleteExceptionAction, startSubscriptionPaymentAction, removePaymentIntegrationAction, saveCrmSettingsAction, saveHoursAction, saveOrderSettingsAction, savePaymentIntegrationAction, savePaymentSettingsAction, saveProfileAction, testPaymentIntegrationAction, type PaymentIntegrationStatus } from "./actions";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { env } from "@/lib/env";

type Sub = { status: SubscriptionStatus; price: number; trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null; plan: { name: string; code: string; limits: Record<string, number | null>; features: string[] } | null } | null;

export function SettingsView({ tab, org, hours, exceptions, subscription, payments, canBilling, integration, plans, access }: { plans: PlanOption[]; access: PlanAccess | null; integration: PaymentIntegrationStatus; tab: string; org: Organization; hours: Shift[]; exceptions: { id: string; date: string; is_closed: boolean; opens_at: string | null; closes_at: string | null; reason: string | null }[]; subscription: Sub; payments: { id: string; amount: number; due_date: string; status: string; paid_at: string | null; method: string | null }[]; canBilling: boolean }) {
  const tabs = [
    { value: "loja", label: "Loja e aparência" },
    { value: "horarios", label: "Horários" },
    { value: "pedidos", label: "Pedidos" },
    { value: "pagamentos", label: "Pagamentos" },
    { value: "clientes", label: "Clientes (CRM)" },
    { value: "dominio", label: "Endereço do cardápio" },
    ...(canBilling ? [{ value: "assinatura", label: "Assinatura" }] : []),
  ];
  return (
    <>
      <LinkTabs active={tab} items={tabs.map((t) => ({ ...t, href: `/app/configuracoes?tab=${t.value}` }))} className="mb-2" />
      {tab === "loja" && <StoreProfile org={org} />}
      {tab === "horarios" && <Hours hours={hours} exceptions={exceptions} />}
      {tab === "pedidos" && <OrderSettings org={org} />}
      {tab === "pagamentos" && <><PaymentSettings org={org} /><MercadoPagoSettings org={org} status={integration} /></>}
      {tab === "clientes" && <CrmSettings org={org} />}
      {tab === "dominio" && <Domain org={org} />}
      {tab === "assinatura" && canBilling && <Billing sub={subscription} payments={payments} plans={plans} access={access} />}
    </>
  );
}

function SaveBar({ onSave, pending }: { onSave: () => void; pending: boolean }) {
  return <div className="sticky bottom-20 z-10 mt-2 flex justify-end lg:bottom-4"><Button variant="dark" size="lg" loading={pending} onClick={onSave} className="shadow-pop">Salvar alterações</Button></div>;
}

function StoreProfile({ org }: { org: Organization }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({
    name: org.name, description: org.description ?? "", legal_name: org.legal_name ?? "", cnpj: org.cnpj ?? "", email: org.email ?? "",
    phone: maskPhone(org.phone ?? ""), whatsapp: maskPhone(org.whatsapp ?? ""), instagram: org.instagram ?? "",
    address_zip: maskCep(org.address_zip ?? ""), address_street: org.address_street ?? "", address_number: org.address_number ?? "", address_district: org.address_district ?? "",
    address_complement: org.address_complement ?? "", address_city: org.address_city ?? "", address_state: org.address_state ?? "",
    logo_url: org.logo_url, banner_url: org.banner_url, primary_color: org.primary_color, secondary_color: org.secondary_color,
  });
  const set = (k: keyof typeof f, v: string | null) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <Section title="Identidade" description="Logo, capa e cores do seu cardápio online.">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Logo"><ImageUpload orgId={org.id} folder="brand" value={f.logo_url} onChange={(v) => set("logo_url", v)} maxSize={800} /></Field>
          <Field label="Banner (capa)" help="Ideal 2400×900 px. Exibido nítido em telas grandes."><ImageUpload orgId={org.id} folder="brand" aspect="banner" value={f.banner_url} onChange={(v) => set("banner_url", v)} /></Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Cor principal" help="Botões e destaques do cardápio">
            <div className="flex items-center gap-2"><input type="color" aria-label="Cor principal" value={f.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" /><Input value={f.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="font-mono" /></div>
          </Field>
          <Field label="Cor secundária" help="Categorias, barra do carrinho">
            <div className="flex items-center gap-2"><input type="color" aria-label="Cor secundária" value={f.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" /><Input value={f.secondary_color} onChange={(e) => set("secondary_color", e.target.value)} className="font-mono" /></div>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper p-4">
          <span className="text-xs text-muted">Prévia:</span>
          <span className="rounded-lg px-4 py-2.5 text-[14px] font-bold" style={{ background: f.primary_color, color: readableOn(/^#[0-9a-f]{6}$/i.test(f.primary_color) ? f.primary_color : "#000000") }}>ADICIONAR · R$ 32,90</span>
          <span className="rounded-full px-4 py-2 text-[14px] font-semibold" style={{ background: f.secondary_color, color: readableOn(/^#[0-9a-f]{6}$/i.test(f.secondary_color) ? f.secondary_color : "#000000") }}>Hambúrgueres</span>
        </div>
      </Section>
      <Section title="Dados da loja">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da hamburgueria" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Descrição curta" className="sm:col-span-2" help="Aparece no topo do cardápio"><Textarea rows={2} maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Hamburgueria artesanal · burger feito na brasa" /></Field>
          <Field label="Razão social"><Input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
          <Field label="CNPJ"><Input value={f.cnpj} onChange={(e) => set("cnpj", maskCnpj(e.target.value))} /></Field>
          <Field label="Telefone"><Input value={f.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} /></Field>
          <Field label="WhatsApp" help="Botão “Falar com a hamburgueria”"><Input value={f.whatsapp} onChange={(e) => set("whatsapp", maskPhone(e.target.value))} /></Field>
          <Field label="Instagram"><Input leading="@" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Endereço" description="Mostrado para retirada e no rodapé do cardápio.">
        <div className="grid gap-4 sm:grid-cols-[140px_1fr_100px]">
          <Field label="CEP"><Input value={f.address_zip} onChange={(e) => set("address_zip", maskCep(e.target.value))} /></Field>
          <Field label="Rua"><Input value={f.address_street} onChange={(e) => set("address_street", e.target.value)} /></Field>
          <Field label="Número"><Input value={f.address_number} onChange={(e) => set("address_number", e.target.value)} /></Field>
          <Field label="Bairro" className="sm:col-span-2"><Input value={f.address_district} onChange={(e) => set("address_district", e.target.value)} /></Field>
          <Field label="UF"><Input maxLength={2} value={f.address_state} onChange={(e) => set("address_state", e.target.value.toUpperCase())} /></Field>
          <Field label="Cidade" className="sm:col-span-2"><Input value={f.address_city} onChange={(e) => set("address_city", e.target.value)} /></Field>
          <Field label="Complemento"><Input value={f.address_complement} onChange={(e) => set("address_complement", e.target.value)} /></Field>
        </div>
      </Section>
      <SaveBar pending={pending} onSave={() => run(() => saveProfileAction(f), { success: "Dados da loja salvos" })} />
    </>
  );
}

function Hours({ hours, exceptions }: { hours: Shift[]; exceptions: { id: string; date: string; is_closed: boolean; opens_at: string | null; closes_at: string | null; reason: string | null }[] }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(hours);
  const [ex, setEx] = useState({ date: "", is_closed: true, opens_at: "18:00", closes_at: "23:00", reason: "" });
  return (
    <>
      <Section title="Funcionamento semanal" description="O cardápio abre e fecha sozinho nesses horários (modo automático). Você também pode abrir/fechar manualmente pelo topo do painel.">
        <HoursEditor value={value} onChange={setValue} />
        <div className="mt-3 flex justify-end"><Button variant="dark" loading={pending} onClick={() => run(() => saveHoursAction(value), { success: "Horários salvos" })}>Salvar horários</Button></div>
      </Section>
      <Section title="Exceções" description="Feriados, eventos e fechamentos temporários.">
        <div className="grid items-end gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[150px_150px_1fr_auto]">
          <Field label="Data"><Input type="date" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} /></Field>
          <Field label="Tipo"><Select value={ex.is_closed ? "closed" : "special"} onChange={(e) => setEx({ ...ex, is_closed: e.target.value === "closed" })}><option value="closed">Fechado</option><option value="special">Horário especial</option></Select></Field>
          {ex.is_closed ? <Field label="Motivo"><Input value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} placeholder="Feriado, reforma…" /></Field> : (
            <div className="flex items-end gap-2"><Field label="Abre"><Input type="time" value={ex.opens_at} onChange={(e) => setEx({ ...ex, opens_at: e.target.value })} /></Field><Field label="Fecha"><Input type="time" value={ex.closes_at} onChange={(e) => setEx({ ...ex, closes_at: e.target.value })} /></Field></div>
          )}
          <Button variant="primary" icon="plus" loading={pending} onClick={() => run(() => addExceptionAction({ ...ex, opens_at: ex.is_closed ? null : ex.opens_at, closes_at: ex.is_closed ? null : ex.closes_at }), { success: "Exceção salva" })}>Adicionar</Button>
        </div>
        {exceptions.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="num w-24 font-medium">{date(e.date)}</span>
                <span className="flex-1">{e.is_closed ? <Badge tone="red">Fechado</Badge> : <Badge tone="blue">{e.opens_at?.slice(0, 5)} – {e.closes_at?.slice(0, 5)}</Badge>} <span className="ml-2 text-muted">{e.reason}</span></span>
                <IconButton icon="trash" label="Remover" size="sm" className="text-ketchup-500" onClick={() => run(() => deleteExceptionAction(e.id), { success: "Exceção removida" })} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function OrderSettings({ org }: { org: Organization }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ accepts_delivery: org.accepts_delivery, accepts_pickup: org.accepts_pickup, accepts_dine_in: org.accepts_dine_in, allow_scheduling: org.allow_scheduling, auto_confirm_table_orders: org.auto_confirm_table_orders, min_order_value: Number(org.min_order_value), pickup_eta_min: org.pickup_eta_min, pickup_eta_max: org.pickup_eta_max, closed_message: org.closed_message, timezone: org.timezone });
  return (
    <>
      <Section title="Como o cliente recebe">
        <div className="space-y-3">
          <Checkbox checked={f.accepts_delivery} onChange={(v) => setF({ ...f, accepts_delivery: v })} label="Entrega" description="Taxa e tempo definidos em Áreas de entrega" />
          <Checkbox checked={f.accepts_pickup} onChange={(v) => setF({ ...f, accepts_pickup: v })} label="Retirada no balcão" />
          <Checkbox checked={f.accepts_dine_in} onChange={(v) => setF({ ...f, accepts_dine_in: v })} label="Consumo no local / mesas com QR Code" />
        </div>
      </Section>
      <Section title="Regras">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pedido mínimo (entrega)"><MoneyInput value={f.min_order_value} onChange={(v) => setF({ ...f, min_order_value: v ?? 0 })} /></Field>
          <Field label="Retirada: tempo mínimo" hint="min"><Input type="number" min={0} value={f.pickup_eta_min} onChange={(e) => setF({ ...f, pickup_eta_min: Number(e.target.value) })} /></Field>
          <Field label="Retirada: tempo máximo" hint="min"><Input type="number" min={0} value={f.pickup_eta_max} onChange={(e) => setF({ ...f, pickup_eta_max: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4 space-y-3">
          <Checkbox checked={f.allow_scheduling} onChange={(v) => setF({ ...f, allow_scheduling: v })} label="Permitir pedidos agendados" description="O cliente escolhe um horário dentro do expediente (inclusive com a loja fechada)" />
          <Checkbox checked={f.auto_confirm_table_orders} onChange={(v) => setF({ ...f, auto_confirm_table_orders: v })} label="Pedidos da mesa vão direto para a cozinha" description="Sem precisar confirmar no painel" />
        </div>
        <Field label="Mensagem de loja fechada" className="mt-4"><Input value={f.closed_message} onChange={(e) => setF({ ...f, closed_message: e.target.value })} /></Field>
        <Field label="Fuso horário" className="mt-4"><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{["America/Bahia", "America/Sao_Paulo", "America/Recife", "America/Fortaleza", "America/Belem", "America/Manaus", "America/Cuiaba", "America/Campo_Grande", "America/Porto_Velho", "America/Boa_Vista", "America/Rio_Branco", "America/Noronha"].map((t) => <option key={t} value={t}>{t.replace("America/", "").replace("_", " ")}</option>)}</Select></Field>
      </Section>
      <SaveBar pending={pending} onSave={() => run(() => saveOrderSettingsAction(f), { success: "Configurações de pedidos salvas" })} />
    </>
  );
}

function PaymentSettings({ org }: { org: Organization }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ accepts_pix: org.accepts_pix, accepts_cash: org.accepts_cash, accepts_card: org.accepts_card, pix_key: org.pix_key ?? "", pix_key_type: (org.pix_key_type ?? "random") as "random", pix_holder_name: org.pix_holder_name ?? "", pix_city: org.pix_city ?? "" });
  return (
    <>
      <Section title="Formas aceitas" description="Pagamento na entrega/retirada. O cartão online fica preparado para integração com gateway.">
        <div className="space-y-3">
          <Checkbox checked={f.accepts_pix} onChange={(v) => setF({ ...f, accepts_pix: v })} label="Pix" />
          <Checkbox checked={f.accepts_cash} onChange={(v) => setF({ ...f, accepts_cash: v })} label="Dinheiro (com troco)" />
          <Checkbox checked={f.accepts_card} onChange={(v) => setF({ ...f, accepts_card: v })} label="Cartão na entrega / no balcão" />
        </div>
      </Section>
      <Section title="Chave Pix" description="O cliente recebe a chave e o Pix copia-e-cola com o valor do pedido. A confirmação do pagamento é feita pela equipe no painel.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de chave"><Select value={f.pix_key_type} onChange={(e) => setF({ ...f, pix_key_type: e.target.value as "random" })}><option value="cnpj">CNPJ</option><option value="cpf">CPF</option><option value="phone">Telefone</option><option value="email">E-mail</option><option value="random">Aleatória</option></Select></Field>
          <Field label="Chave"><Input value={f.pix_key} onChange={(e) => setF({ ...f, pix_key: e.target.value })} /></Field>
          <Field label="Nome do favorecido" help="Como aparece no banco (até 25 letras)"><Input value={f.pix_holder_name} onChange={(e) => setF({ ...f, pix_holder_name: e.target.value })} /></Field>
          <Field label="Cidade"><Input value={f.pix_city} onChange={(e) => setF({ ...f, pix_city: e.target.value })} /></Field>
        </div>
        <Notice className="mt-3">Pix automático (QR dinâmico com baixa automática) exige um gateway como Mercado Pago ou PagSeguro. A estrutura de pedidos já guarda provedor e referência do pagamento.</Notice>
      </Section>
      <SaveBar pending={pending} onSave={() => run(() => savePaymentSettingsAction({ ...f, pix_key_type: f.pix_key ? f.pix_key_type : null }), { success: "Pagamentos salvos" })} />
    </>
  );
}

function CrmSettings({ org }: { org: Organization }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ vip_min_orders: org.vip_min_orders, vip_min_spent: Number(org.vip_min_spent), inactive_days: org.inactive_days });
  return (
    <>
      <Section title="Segmentação automática" description="Define quem é VIP e quem está inativo para campanhas de marketing.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="VIP a partir de" hint="pedidos"><Input type="number" min={1} value={f.vip_min_orders} onChange={(e) => setF({ ...f, vip_min_orders: Number(e.target.value) })} /></Field>
          <Field label="ou gasto total acima de"><MoneyInput value={f.vip_min_spent} onChange={(v) => setF({ ...f, vip_min_spent: v ?? 0 })} /></Field>
          <Field label="Inativo após" hint="dias sem pedir"><Input type="number" min={7} value={f.inactive_days} onChange={(e) => setF({ ...f, inactive_days: Number(e.target.value) })} /></Field>
        </div>
      </Section>
      <SaveBar pending={pending} onSave={() => run(() => saveCrmSettingsAction(f), { success: "Segmentação salva" })} />
    </>
  );
}

function Domain({ org }: { org: Organization }) {
  const url = storeUrl(org.slug);
  return (
    <Section title="Endereço do cardápio" description="Compartilhe este link no Instagram e no WhatsApp.">
      <Card>
        <p className="text-xs text-muted">Seu link</p>
        <p className="mt-1 break-all font-mono text-[15px] font-semibold">{url}</p>
        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13px] font-medium text-ember-600 hover:underline">Abrir cardápio</a>
      </Card>
      <Card className="mt-4">
        <p className="font-medium">Domínio próprio {org.custom_domain && <Badge tone="green" className="ml-2">{org.custom_domain}</Badge>}</p>
        <p className="mt-1 text-[13px] text-muted">Disponível no plano Premium. Aponte um CNAME do seu domínio (ex.: pedidos.suahamburgueria.com.br) para cname.vercel-dns.com e peça a ativação ao suporte. A ativação é feita pela administração da plataforma.</p>
      </Card>
    </Section>
  );
}

function Billing({ sub, payments, plans, access }: { sub: Sub; plans: PlanOption[]; access: PlanAccess | null; payments: { id: string; amount: number; due_date: string; status: string; paid_at: string | null; method: string | null }[] }) {
  if (!sub) return <Notice className="mt-6">Assinatura não encontrada. Fale com o suporte.</Notice>;
  const st = SUBSCRIPTION_STATUS[sub.status];
  const limits = sub.plan?.limits ?? {};
  const open = payments.filter((p) => p.status === "pending" || p.status === "overdue").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return (
    <>
      <Section title="Plano atual">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-display text-2xl font-semibold">{sub.plan?.name}</p>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            <p className="num ml-auto font-display text-xl font-semibold">{money(sub.price)}<span className="text-sm font-normal text-muted">/mês</span></p>
          </div>
          {access?.trialActive && access.trialEndsAt ? (
            <p className="mt-2 text-[13px] text-muted">
              <b className="text-ink">{trialLabel(daysLeft(access.trialEndsAt))}</b> (até {date(access.trialEndsAt)}). Todos os recursos estão liberados durante o teste.
              {access.planChosen ? ` Ao terminar, vale o plano ${sub.plan?.name}.` : " Escolha um plano abaixo para continuar depois do teste."}
            </p>
          ) : access?.needsPlan ? (
            <p className="mt-2 text-[13px] text-ketchup-500">Teste grátis encerrado. Escolha um plano abaixo — seus dados continuam salvos.</p>
          ) : null}
          {sub.current_period_end && <p className="mt-1 text-[13px] text-muted">Período atual: {date(sub.current_period_start)} a {date(sub.current_period_end)}</p>}
          <dl className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
            <div><dt className="text-muted">Usuários</dt><dd className="font-medium">{limits.max_members ?? "ilimitado"}</dd></div>
            <div><dt className="text-muted">Produtos</dt><dd className="font-medium">{limits.max_products ?? "ilimitado"}</dd></div>
            <div><dt className="text-muted">Pedidos/mês</dt><dd className="font-medium">{limits.max_orders_month ?? "ilimitado"}</dd></div>
          </dl>
          {sub.status !== "cancelled" && sub.price > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <PayButton label={open ? `Pagar fatura de ${money(open.amount)}` : "Pagar mensalidade"} />
              <p className="text-xs text-muted">Pix na hora: a assinatura é liberada automaticamente após o pagamento.</p>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Para mudar de plano, fale com o suporte do TOP BURGER OS.</p>
        </Card>
      </Section>
      <Section title={access?.planChosen ? "Trocar de plano" : "Escolher plano"} description="Upgrade ou downgrade a qualquer momento. Nenhum dado é apagado ao trocar.">
        <PlanPicker plans={plans} currentCode={sub.plan?.code} chosen={access?.planChosen} trialActive={access?.trialActive} canChoose />
      </Section>
      <Section title="Faturas">
        {payments.length === 0 ? <p className="text-[13px] text-muted">Nenhuma fatura emitida.</p> : (
          <Table>
            <thead><tr><Th>Vencimento</Th><Th align="right">Valor</Th><Th>Situação</Th><Th>Pago em</Th><Th>{""}</Th></tr></thead>
            <tbody>{payments.map((p) => <tr key={p.id}><Td>{date(p.due_date)}</Td><Td align="right" className="num">{money(p.amount)}</Td><Td><Badge tone={p.status === "paid" ? "green" : p.status === "overdue" ? "red" : "mustard"}>{p.status === "paid" ? "Paga" : p.status === "overdue" ? "Atrasada" : p.status === "cancelled" ? "Cancelada" : "Em aberto"}</Badge></Td><Td>{p.paid_at ? date(p.paid_at) : "—"}</Td><Td align="right">{open && p.id === open.id ? <PayButton label="Pagar" small /> : null}</Td></tr>)}</tbody>
          </Table>
        )}
      </Section>
    </>
  );
}

type SubCharge = { paymentId: string; amount: number; qr_code: string | null; qr_code_base64: string | null; expires_at: string | null };

/** Abre/gera a fatura em aberto e mostra o Pix da plataforma. A baixa é feita pelo servidor. */
function PayButton({ label, small }: { label: string; small?: boolean }) {
  const { run, pending } = useAction();
  const [charge, setCharge] = useState<SubCharge | null>(null);
  const start = () => run(() => startSubscriptionPaymentAction(), { refresh: false, onSuccess: (d) => d && setCharge(d) });
  return (
    <>
      <Button variant={small ? "secondary" : "dark"} size={small ? "sm" : undefined} loading={pending} onClick={() => void start()}>{label}</Button>
      {charge && <SubscriptionPix charge={charge} onClose={() => setCharge(null)} onRenew={() => void start()} renewing={pending} />}
    </>
  );
}

function SubscriptionPix({ charge, onClose, onRenew, renewing }: { charge: SubCharge; onClose: () => void; onRenew: () => void; renewing: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    if (paid) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const r = await checkSubscriptionPaymentAction(charge.paymentId);
        if (r.ok && r.data?.paid) {
          clearInterval(t);
          setPaid(true);
          toast.success("Pagamento confirmado! Assinatura ativa.");
          router.refresh();
        }
      } catch { /* tenta no próximo ciclo */ }
    }, 6000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [charge.paymentId, paid, router, toast]);
  const left = charge.expires_at ? Math.max(0, new Date(charge.expires_at).getTime() - now) : null;
  const expired = left !== null && left <= 0;
  const mm = left !== null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` : null;
  return (
    <Modal open onClose={onClose} title="Pagar mensalidade com Pix" description={`Valor: ${money(charge.amount)}`} size="sm"
      footer={<Button variant="secondary" onClick={onClose}>{paid ? "Fechar" : "Pagar depois"}</Button>}>
      {paid ? (
        <Notice tone="success">Pagamento confirmado. Sua assinatura está ativa — obrigado!</Notice>
      ) : expired ? (
        <div className="rounded-xl bg-sunken p-4 text-center">
          <p className="text-[14px] font-medium">Este QR Code expirou</p>
          <Button className="mt-2" variant="dark" loading={renewing} onClick={onRenew}>Gerar novo QR Code</Button>
        </div>
      ) : (
        <>
          {charge.qr_code_base64 && (
            <img src={`data:image/png;base64,${charge.qr_code_base64}`} alt={`QR Code Pix de ${money(charge.amount)}`} width={220} height={220} className="mx-auto h-[220px] w-[220px] rounded-lg border border-line bg-white p-2 [image-rendering:pixelated]" />
          )}
          {charge.qr_code && (
            <div className="mt-3">
              <p className="text-[13px] text-muted">Pix copia e cola</p>
              <div className="mt-1 flex gap-2">
                <code className="block min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px]">{charge.qr_code}</code>
                <Button variant="dark" onClick={() => { void navigator.clipboard.writeText(charge.qr_code ?? ""); toast.success("Código Pix copiado"); }}>Copiar</Button>
              </div>
            </div>
          )}
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><Spinner size={14} /> Aguardando pagamento{mm ? ` · expira em ${mm}` : ""}. A confirmação é automática.</p>
        </>
      )}
    </Modal>
  );
}

function MercadoPagoSettings({ org, status }: { org: Organization; status: PaymentIntegrationStatus }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [enabled, setEnabled] = useState(status.is_enabled);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const webhook = `${env.appUrl}/api/webhooks/mercadopago?org=${org.id}`;
  return (
    <Section title="Pix automático (Mercado Pago)" description="O cliente paga com QR Code gerado na hora e o pedido é marcado como pago sozinho, sem conferência manual.">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {status.configured ? (
            <>
              <Badge tone={status.is_enabled ? "green" : "neutral"} dot>{status.is_enabled ? "Ativo" : "Desligado"}</Badge>
              <Badge tone={status.live_mode ? "ember" : "blue"}>{status.live_mode ? "Produção" : "Teste (sandbox)"}</Badge>
              <span className="text-[13px] text-muted">Token salvo terminando em <span className="font-mono">{status.token_hint}</span>{status.has_webhook_secret ? " · webhook assinado" : ""}</span>
            </>
          ) : (
            <span className="text-[13px] text-muted">Nenhuma conta conectada. Sem ela, o Pix continua com chave e copia-e-cola estáticos, confirmado pela equipe.</span>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Access Token" help={status.configured ? "Deixe vazio para manter o atual" : "Mercado Pago → Suas integrações → Credenciais"}>
            <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="APP_USR-… ou TEST-…" />
          </Field>
          <Field label="Assinatura secreta do webhook" help="Opcional, recomendado. Em Webhooks → Assinatura secreta">
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={status.has_webhook_secret ? "•••••••• (mantida)" : ""} />
          </Field>
        </div>
        <div className="mt-4">
          <Checkbox checked={enabled} onChange={setEnabled} label="Usar Pix automático no cardápio online" description="Só vale para pedidos com Pix. Dinheiro e cartão na entrega continuam iguais." />
        </div>
        <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-[13px]">
          <p className="font-medium">URL de notificação (webhook)</p>
          <p className="mt-1 break-all font-mono text-[12px]">{webhook}</p>
          <p className="mt-1 text-xs text-muted">Cadastre em Mercado Pago → Suas integrações → Webhooks, evento “Pagamentos”. Em localhost o pedido é conferido pela própria página do cliente a cada poucos segundos.</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {status.configured && (
            <>
              <Button variant="ghost" className="text-ketchup-500" disabled={pending} onClick={async () => { if (await confirm({ title: "Desconectar o Mercado Pago?", description: "O token salvo é apagado. Pedidos já pagos não mudam.", tone: "danger", confirmLabel: "Desconectar" })) run(() => removePaymentIntegrationAction(), { success: "Mercado Pago desconectado" }); }}>Desconectar</Button>
              <Button variant="secondary" loading={pending} onClick={() => run(() => testPaymentIntegrationAction(), { refresh: false, onSuccess: (d) => toast.success(`Conexão OK${d?.nickname ? ` · conta ${d.nickname}` : ""}`) })}>Testar conexão</Button>
            </>
          )}
          <Button variant="dark" loading={pending} onClick={() => run(() => savePaymentIntegrationAction({ enabled, access_token: token, webhook_secret: secret }), { success: "Pix automático salvo", onSuccess: () => { setToken(""); setSecret(""); } })}>Salvar</Button>
        </div>
      </Card>
    </Section>
  );
}
