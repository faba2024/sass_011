"use client";
import Link from "next/link";
import { useState } from "react";
import { OrderComposer } from "@/components/pos/order-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Notice } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { PAYMENT_METHOD } from "@/lib/constants";
import { dateTime, money, time } from "@/lib/format";
import type { PaymentMethod, Storefront } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cashMovementAction, closeRegisterAction, openRegisterAction } from "./actions";

export interface RegisterSummary {
  register_id: string; status: string; opened_at: string; opened_by_name: string | null; closed_at: string | null; opening_amount: number;
  sales_cash: number; sales_pix: number; sales_card: number; sales_total: number; sales_count: number;
  withdrawals: number; supplies: number; refunds_cash: number; refunds_total: number; expected_cash: number; reported_amount: number | null; difference: number | null;
}
const MOVE: Record<string, { label: string; tone: "green" | "red" | "blue" | "mustard" }> = { sale: { label: "Venda", tone: "green" }, withdrawal: { label: "Sangria", tone: "red" }, supply: { label: "Suprimento", tone: "blue" }, refund: { label: "Estorno", tone: "mustard" } };

function SummaryTable({ s }: { s: RegisterSummary }) {
  const rows: [string, number, string?][] = [
    ["Valor inicial (troco)", s.opening_amount],
    ["Vendas em dinheiro", s.sales_cash, "+"],
    ["Suprimentos", s.supplies, "+"],
    ["Sangrias", s.withdrawals, "−"],
    ["Estornos em dinheiro", s.refunds_cash, "−"],
  ];
  return (
    <div className="space-y-4">
      <dl className="space-y-1.5 text-[13px]">
        {rows.map(([l, v, sign]) => <div key={l} className="flex justify-between"><dt className="text-muted">{l}</dt><dd className="num">{sign && v > 0 ? `${sign} ` : ""}{money(v)}</dd></div>)}
        <div className="flex justify-between border-t border-line pt-2 font-display text-lg font-semibold"><dt>Dinheiro esperado na gaveta</dt><dd className="num">{money(s.expected_cash)}</dd></div>
      </dl>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center text-[13px]">
        <div className="bg-surface p-2.5"><p className="text-xs text-muted">Dinheiro</p><p className="num font-semibold">{money(s.sales_cash)}</p></div>
        <div className="bg-surface p-2.5"><p className="text-xs text-muted">Pix</p><p className="num font-semibold">{money(s.sales_pix)}</p></div>
        <div className="bg-surface p-2.5"><p className="text-xs text-muted">Cartão</p><p className="num font-semibold">{money(s.sales_card)}</p></div>
      </div>
      <p className="text-xs text-muted">{s.sales_count} venda(s) · total {money(s.sales_total)}</p>
    </div>
  );
}

export function CashRegisterView({ summary, movements, history, names, sf, tables, tz }: { summary: RegisterSummary | null; movements: { id: string; type: string; payment_method: string; amount: number; reason: string | null; order_id: string | null; created_at: string; created_by: string | null }[]; history: { id: string; opened_at: string; closed_at: string; opening_amount: number; expected_amount: number; reported_amount: number; difference: number; opened_by: string; closed_by: string | null; summary: RegisterSummary | null }[]; names: Record<string, string>; sf: Storefront; tables: { id: string; label: string }[]; tz: string }) {
  const [tab, setTab] = useState<"venda" | "movimentos" | "fechamento" | "historico">("venda");
  const [mov, setMov] = useState<"withdrawal" | "supply" | null>(null);
  const [viewing, setViewing] = useState<(typeof history)[number] | null>(null);

  if (!summary) return <OpenRegister history={history} names={names} tz={tz} onView={setViewing} viewing={viewing} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-pickle-100 bg-pickle-50 px-4 py-3 text-[13px]">
        <span className="h-2.5 w-2.5 rounded-full bg-pickle-500" />
        <span><b>Caixa aberto</b> por {summary.opened_by_name ?? "—"} às {time(summary.opened_at, tz)}</span>
        <span className="num ml-auto">Dinheiro esperado: <b>{money(summary.expected_cash)}</b></span>
        <Button size="sm" onClick={() => setMov("supply")}>Suprimento</Button>
        <Button size="sm" onClick={() => setMov("withdrawal")}>Sangria</Button>
      </div>
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "venda", label: "Venda no balcão" }, { value: "movimentos", label: "Movimentos", count: movements.length }, { value: "fechamento", label: "Fechamento" }, { value: "historico", label: "Caixas anteriores" }]} />
      {tab === "venda" && <OrderComposer sf={sf} tables={tables} mode="pdv" />}
      {tab === "movimentos" && (movements.length === 0 ? <EmptyState icon="register" title="Sem movimentos ainda" /> : (
        <Table>
          <thead><tr><Th>Hora</Th><Th>Tipo</Th><Th>Forma</Th><Th>Descrição</Th><Th>Usuário</Th><Th align="right">Valor</Th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <Td className="text-muted">{time(m.created_at, tz)}</Td>
                <Td><Badge tone={MOVE[m.type]?.tone ?? "neutral"}>{MOVE[m.type]?.label ?? m.type}</Badge></Td>
                <Td>{PAYMENT_METHOD[m.payment_method as PaymentMethod]}</Td>
                <Td>{m.order_id ? <Link href={`/app/pedidos/${m.order_id}`} className="hover:text-ember-600">{m.reason}</Link> : m.reason ?? "—"}</Td>
                <Td className="text-muted">{m.created_by ? names[m.created_by] : "—"}</Td>
                <Td align="right" className={cn("num font-semibold", (m.type === "withdrawal" || m.type === "refund") && "text-ketchup-500")}>{m.type === "withdrawal" || m.type === "refund" ? "− " : ""}{money(m.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ))}
      {tab === "fechamento" && <CloseRegister summary={summary} />}
      {tab === "historico" && <History history={history} names={names} tz={tz} onView={setViewing} />}
      <MovementModal type={mov} onClose={() => setMov(null)} expected={summary.expected_cash} />
      <HistoryModal value={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function OpenRegister({ history, names, tz, onView, viewing }: { history: Parameters<typeof History>[0]["history"]; names: Record<string, string>; tz: string; onView: (h: Parameters<typeof History>[0]["history"][number] | null) => void; viewing: Parameters<typeof History>[0]["history"][number] | null }) {
  const { run, pending } = useAction();
  const [amount, setAmount] = useState<number | null>(history[0] ? Number(history[0].reported_amount) : 100);
  const [notes, setNotes] = useState("");
  return (
    <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card>
        <CardHeader title="Abrir caixa" description="Informe o dinheiro de troco na gaveta. Usuário, data e hora são registrados." />
        <Field label="Valor inicial"><MoneyInput value={amount} onChange={setAmount} className="h-12 text-lg" /></Field>
        <Field label="Observação" className="mt-3"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
        <Button variant="success" size="lg" block icon="power" className="mt-4" loading={pending} onClick={() => run(() => openRegisterAction(amount ?? 0, notes), { success: "Caixa aberto" })}>Abrir caixa</Button>
        <p className="mt-3 text-xs text-muted">Com o caixa fechado, vendas no balcão ficam bloqueadas. Pedidos online continuam chegando normalmente.</p>
      </Card>
      <History history={history} names={names} tz={tz} onView={onView} />
      <HistoryModal value={viewing} onClose={() => onView(null)} />
    </div>
  );
}

function History({ history, names, tz, onView }: { history: { id: string; opened_at: string; closed_at: string; opening_amount: number; expected_amount: number; reported_amount: number; difference: number; opened_by: string; closed_by: string | null; summary: RegisterSummary | null }[]; names: Record<string, string>; tz: string; onView: (h: { id: string; opened_at: string; closed_at: string; opening_amount: number; expected_amount: number; reported_amount: number; difference: number; opened_by: string; closed_by: string | null; summary: RegisterSummary | null }) => void }) {
  if (!history.length) return <EmptyState icon="history" title="Nenhum caixa fechado ainda" />;
  return (
    <Table>
      <thead><tr><Th>Período</Th><Th>Operador</Th><Th align="right">Vendas</Th><Th align="right">Esperado</Th><Th align="right">Informado</Th><Th align="right">Diferença</Th><Th /></tr></thead>
      <tbody>
        {history.map((h) => (
          <tr key={h.id}>
            <Td>{dateTime(h.opened_at, tz)} → {time(h.closed_at, tz)}</Td>
            <Td className="text-muted">{names[h.closed_by ?? h.opened_by] ?? "—"}</Td>
            <Td align="right" className="num">{money(h.summary?.sales_total ?? 0)}</Td>
            <Td align="right" className="num">{money(h.expected_amount)}</Td>
            <Td align="right" className="num">{money(h.reported_amount)}</Td>
            <Td align="right" className={cn("num font-semibold", Number(h.difference) < 0 ? "text-ketchup-500" : Number(h.difference) > 0 ? "text-blueberry-500" : "text-pickle-700")}>{Number(h.difference) > 0 ? "+" : ""}{money(h.difference)}</Td>
            <Td align="right"><Button size="xs" variant="ghost" onClick={() => onView(h)}>Detalhes</Button></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function HistoryModal({ value, onClose }: { value: { summary: RegisterSummary | null; reported_amount: number; difference: number } | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(value)} onClose={onClose} title="Fechamento do caixa" size="sm">
      {value?.summary && (
        <>
          <SummaryTable s={value.summary} />
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Valor informado</dt><dd className="num">{money(value.reported_amount)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Diferença</dt><dd className="num">{money(value.difference)}</dd></div>
          </dl>
        </>
      )}
    </Modal>
  );
}

function CloseRegister({ summary }: { summary: RegisterSummary }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [reported, setReported] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const diff = reported != null ? reported - Number(summary.expected_cash) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader title="Resumo do caixa" /><SummaryTable s={summary} /></Card>
      <Card>
        <CardHeader title="Conferência" description="Conte o dinheiro da gaveta e informe o valor." />
        <Field label="Valor contado em dinheiro"><MoneyInput value={reported} onChange={setReported} className="h-12 text-lg" /></Field>
        {diff != null && (
          <Notice tone={Math.abs(diff) < 0.005 ? "success" : diff < 0 ? "error" : "warn"} className="mt-3">
            {Math.abs(diff) < 0.005 ? "Caixa batendo certinho." : diff < 0 ? `Falta ${money(-diff)} em relação ao esperado.` : `Sobra ${money(diff)} em relação ao esperado.`}
          </Notice>
        )}
        <Field label="Observação" className="mt-3"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Justificativa de diferença, se houver" /></Field>
        <Button variant="dark" size="lg" block className="mt-4" loading={pending} disabled={reported == null} onClick={async () => { if (await confirm({ title: "Fechar o caixa?", description: `Esperado ${money(summary.expected_cash)} · informado ${money(reported ?? 0)}. Esta ação não pode ser desfeita.`, confirmLabel: "Fechar caixa" })) void run(() => closeRegisterAction(reported ?? 0, notes), { success: "Caixa fechado" }); }}>Fechar caixa</Button>
      </Card>
    </div>
  );
}

function MovementModal({ type, onClose, expected }: { type: "withdrawal" | "supply" | null; onClose: () => void; expected: number }) {
  const { run, pending } = useAction();
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const isW = type === "withdrawal";
  return (
    <Modal open={Boolean(type)} onClose={onClose} title={isW ? "Sangria (retirada)" : "Suprimento (entrada)"} description={isW ? `Disponível em dinheiro: ${money(expected)}` : "Entrada manual de dinheiro na gaveta"} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} disabled={!amount || (isW && reason.trim().length < 3)} onClick={() => run(() => cashMovementAction(type!, amount ?? 0, reason), { success: isW ? "Sangria registrada" : "Suprimento registrado", onSuccess: () => { setAmount(null); setReason(""); onClose(); } })}>Registrar</Button></>}>
      <div className="space-y-4">
        <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Motivo" required={isW}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isW ? "Ex.: depósito, pagamento de fornecedor" : "Ex.: reforço de troco"} /></Field>
      </div>
    </Modal>
  );
}
