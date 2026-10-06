"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { useToast } from "@/components/ui/toast";
import { date, money } from "@/lib/format";
import { sum } from "@/lib/utils";
import { cancelInvoiceAction, refreshBillingAction, registerPaymentAction } from "../actions";

export interface InvoiceRow { id: string; amount: number; due_date: string; status: "pending" | "paid" | "overdue" | "cancelled"; paid_at: string | null; method: string | null; organization: { id: string; name: string; slug: string } | null }

const ST = { pending: { label: "Em aberto", tone: "mustard" }, paid: { label: "Paga", tone: "green" }, overdue: { label: "Atrasada", tone: "red" }, cancelled: { label: "Cancelada", tone: "neutral" } } as const;
const METHODS: Record<string, string> = { pix: "Pix", boleto: "Boleto", card: "Cartão", transfer: "Transferência", cash: "Dinheiro" };

export function InvoicesView({ rows, status }: { rows: InvoiceRow[]; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useAction();
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [method, setMethod] = useState("pix");
  const open = rows.filter((r) => r.status === "pending" || r.status === "overdue");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onChange={(v) => router.push(v ? `/master/assinaturas?status=${v}` : "/master/assinaturas")} items={[{ value: "", label: "Todas" }, { value: "pending", label: "Em aberto" }, { value: "overdue", label: "Atrasadas" }, { value: "paid", label: "Pagas" }, { value: "cancelled", label: "Canceladas" }]} />
        <Button icon="refresh" loading={pending} onClick={() => run(() => refreshBillingAction(), { onSuccess: (d) => toast.success(`${d?.overdue ?? 0} fatura(s) marcadas como atrasadas · ${d?.trials_expired ?? 0} trial(s) expirados`) })}>Atualizar vencimentos</Button>
      </div>
      {open.length > 0 && <p className="mb-3 text-[13px] text-muted">A receber nesta lista: <b className="num text-ink">{money(sum(open.map((r) => Number(r.amount))))}</b></p>}
      {rows.length === 0 ? <EmptyState icon="receipt" title="Nenhuma fatura" description="Gere faturas pelo menu de cada empresa." /> : (
        <Table>
          <thead><tr><Th>Empresa</Th><Th>Vencimento</Th><Th align="right">Valor</Th><Th>Situação</Th><Th>Pagamento</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.organization?.name ?? "—"}</Td>
                <Td>{date(r.due_date)}</Td>
                <Td align="right" className="num">{money(r.amount)}</Td>
                <Td><Badge tone={ST[r.status].tone}>{ST[r.status].label}</Badge></Td>
                <Td className="text-muted">{r.paid_at ? `${date(r.paid_at)} · ${METHODS[r.method ?? ""] ?? r.method ?? ""}` : "—"}</Td>
                <Td align="right">
                  {(r.status === "pending" || r.status === "overdue") && (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="success" onClick={() => setPaying(r)}>Dar baixa</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => cancelInvoiceAction(r.id), { success: "Fatura cancelada" })}>Cancelar</Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {paying && (
        <Modal open onClose={() => setPaying(null)} title="Registrar pagamento" description={`${paying.organization?.name} · ${money(paying.amount)} · vence ${date(paying.due_date)}`}
          footer={<><Button variant="ghost" onClick={() => setPaying(null)}>Cancelar</Button><Button variant="primary" loading={pending} onClick={() => run(() => registerPaymentAction(paying.id, method), { success: "Pagamento registrado", onSuccess: () => setPaying(null) })}>Confirmar baixa</Button></>}>
          <Field label="Forma de pagamento"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </Modal>
      )}
    </>
  );
}
