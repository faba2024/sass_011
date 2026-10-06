"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Notice } from "@/components/ui/states";
import { useAction } from "@/hooks/use-action";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { downloadCSV } from "@/lib/csv";
import { date, localDateISO, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteExpenseAction, saveExpenseAction, setExpensePaidAction } from "./actions";

export interface Expense { id: string; category: string; description: string; amount: number; due_date: string; status: "pending" | "paid"; paid_at: string | null; recurrence: "none" | "weekly" | "monthly"; supplier_id: string | null; notes: string | null }
const REC = { none: "Única", weekly: "Semanal", monthly: "Mensal" };

export function ExpensesManager({ expenses, overdue, suppliers, canManage }: { expenses: Expense[]; overdue: Expense[]; suppliers: { id: string; name: string }[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [status, setStatus] = useState("");
  const [cat, setCat] = useState("");
  const { run } = useAction();
  const confirm = useConfirm();
  const today = localDateISO();
  const list = [...overdue, ...expenses].filter((e) => (!status || (status === "overdue" ? e.status === "pending" && e.due_date < today : e.status === status)) && (!cat || e.category === cat));
  const sum = (l: Expense[]) => l.reduce((a, e) => a + Number(e.amount), 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card">
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Pagas</p><p className="num font-display text-xl font-semibold">{money(sum(expenses.filter((e) => e.status === "paid")))}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">A pagar</p><p className="num font-display text-xl font-semibold">{money(sum(expenses.filter((e) => e.status === "pending")))}</p></div>
        <div className="bg-surface px-4 py-3"><p className="text-xs text-muted">Vencidas</p><p className="num font-display text-xl font-semibold text-ketchup-500">{money(sum([...overdue, ...expenses].filter((e) => e.status === "pending" && e.due_date < today)))}</p></div>
      </div>
      {overdue.length > 0 && <Notice tone="error" className="mb-3">{overdue.length} conta(s) vencida(s) de períodos anteriores aparecem no topo da lista.</Notice>}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-[calc(50%-4px)] sm:w-40"><Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação"><option value="">Todas</option><option value="pending">A pagar</option><option value="overdue">Vencidas</option><option value="paid">Pagas</option></Select></div>
        <div className="w-[calc(50%-4px)] sm:w-44"><Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div className="ml-auto flex gap-2">
          <Button icon="download" onClick={() => downloadCSV("despesas", list.map((e) => ({ ...e, category: EXPENSE_CATEGORIES[e.category], status: e.status === "paid" ? "Paga" : "A pagar", recurrence: REC[e.recurrence] })), [{ key: "due_date", label: "Vencimento" }, { key: "description", label: "Descrição" }, { key: "category", label: "Categoria" }, { key: "amount", label: "Valor" }, { key: "status", label: "Situação" }, { key: "recurrence", label: "Recorrência" }])}>Exportar</Button>
          {canManage && <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Nova despesa</Button>}
        </div>
      </div>
      {list.length === 0 ? <EmptyState icon="receipt" title="Nenhuma despesa no período" description="Cadastre aluguel, energia, água, equipe e fornecedores para ver o lucro real." /> : (
        <Table>
          <thead><tr><Th>Vencimento</Th><Th>Descrição</Th><Th>Categoria</Th><Th>Recorrência</Th><Th align="right">Valor</Th><Th>Situação</Th><Th /></tr></thead>
          <tbody>
            {list.map((e) => {
              const late = e.status === "pending" && e.due_date < today;
              return (
                <tr key={e.id}>
                  <Td className={cn("num", late && "font-semibold text-ketchup-500")}>{date(e.due_date)}</Td>
                  <Td><span className="font-medium">{e.description}</span>{e.notes && <span className="block text-xs text-muted">{e.notes}</span>}</Td>
                  <Td>{EXPENSE_CATEGORIES[e.category]}</Td>
                  <Td className="text-muted">{REC[e.recurrence]}</Td>
                  <Td align="right" className="num font-semibold">{money(e.amount)}</Td>
                  <Td><Badge tone={e.status === "paid" ? "green" : late ? "red" : "mustard"} dot>{e.status === "paid" ? "Paga" : late ? "Vencida" : "A pagar"}</Badge></Td>
                  <Td align="right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant={e.status === "paid" ? "ghost" : "success"} onClick={() => run(() => setExpensePaidAction(e.id, e.status !== "paid"), { success: e.status === "paid" ? "Marcada como a pagar" : "Despesa paga" })}>{e.status === "paid" ? "Desfazer" : "Pagar"}</Button>
                        <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(e)} />
                        <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir "${e.description}"?`, description: "Se estava paga, sai também do financeiro.", tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteExpenseAction(e.id), { success: "Despesa excluída" }); }} />
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <ExpenseModal value={editing} suppliers={suppliers} onClose={() => setEditing(null)} />
    </>
  );
}

function ExpenseModal({ value, suppliers, onClose }: { value: Expense | "new" | null; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const blank = { category: "outras", description: "", amount: null as number | null, due_date: localDateISO(), status: "pending" as "pending" | "paid", recurrence: "none" as Expense["recurrence"], supplier_id: "", notes: "" };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (value && value !== "new") setF({ category: value.category, description: value.description, amount: Number(value.amount), due_date: value.due_date, status: value.status, recurrence: value.recurrence, supplier_id: value.supplier_id ?? "", notes: value.notes ?? "" });
    else setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Nova despesa" : "Editar despesa"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveExpenseAction({ ...f, category: f.category as "outras", amount: f.amount ?? 0, supplier_id: f.supplier_id || null, paid_at: null }, value && value !== "new" ? value.id : null), { success: "Despesa salva", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição" required className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Conta de energia" /></Field>
        <Field label="Categoria"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Valor" required><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Vencimento"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Situação"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "pending" | "paid" })}><option value="pending">A pagar</option><option value="paid">Paga</option></Select></Field>
        <Field label="Recorrência" help="Ao pagar, a próxima é criada automaticamente"><Select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value as Expense["recurrence"] })}><option value="none">Única</option><option value="monthly">Mensal</option><option value="weekly">Semanal</option></Select></Field>
        <Field label="Fornecedor"><Select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Observação" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
