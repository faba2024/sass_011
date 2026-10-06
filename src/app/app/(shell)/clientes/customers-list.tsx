"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useAction } from "@/hooks/use-action";
import { SEGMENTS } from "@/lib/constants";
import { downloadCSV } from "@/lib/csv";
import { date, maskPhone, money, phone, relative } from "@/lib/format";
import { saveCustomerAction } from "./actions";
import { useRouter } from "next/navigation";

export interface CustomerListRow { id: string; name: string; phone: string | null; email: string | null; tags: string[]; orders_count: number; total_spent: number; last_order_at: string | null; created_at: string; segment: string; avg_ticket: number; points: number }
const PAGE = 50;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CustomersList({ rows, initialSegment, canManage, tz }: { rows: CustomerListRow[]; initialSegment: string; canManage: boolean; tz: string }) {
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState(initialSegment);
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const tags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);
  const filtered = useMemo(() => {
    const nq = norm(q);
    const digits = q.replace(/\D/g, "");
    const list = rows.filter((r) => (!nq || norm(r.name).includes(nq) || (digits.length >= 3 && r.phone?.includes(digits))) && (!segment || r.segment === segment) && (!tag || r.tags.includes(tag)));
    const by: Record<string, (a: CustomerListRow, b: CustomerListRow) => number> = {
      recent: (a, b) => (b.last_order_at ?? "").localeCompare(a.last_order_at ?? ""),
      spent: (a, b) => Number(b.total_spent) - Number(a.total_spent),
      orders: (a, b) => b.orders_count - a.orders_count,
      name: (a, b) => a.name.localeCompare(b.name),
      new: (a, b) => b.created_at.localeCompare(a.created_at),
    };
    return [...list].sort(by[sort]);
  }, [rows, q, segment, tag, sort]);
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const counts = Object.fromEntries(Object.keys(SEGMENTS).map((s) => [s, rows.filter((r) => r.segment === s).length]));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(SEGMENTS).map(([k, v]) => (
          <button key={k} type="button" onClick={() => { setSegment(segment === k ? "" : k); setPage(1); }} className={`rounded-lg border px-4 py-3 text-left transition ${segment === k ? "border-ember-500 bg-ember-50" : "border-line bg-surface hover:border-line-strong"}`}>
            <p className="text-xs text-muted">{v.label} <span className="text-faint">· {v.hint}</span></p>
            <p className="num font-display text-xl font-semibold">{counts[k]}</p>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64"><Input icon="search" placeholder="Nome ou telefone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="w-[calc(50%-4px)] sm:w-40"><Select value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} aria-label="Tag"><option value="">Todas as tags</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</Select></div>
        <div className="w-[calc(50%-4px)] sm:w-44"><Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar"><option value="recent">Último pedido</option><option value="spent">Maior gasto</option><option value="orders">Mais pedidos</option><option value="new">Cadastro recente</option><option value="name">Nome</option></Select></div>
        <div className="ml-auto flex gap-2">
          <Button icon="download" onClick={() => downloadCSV("clientes", filtered.map((r) => ({ ...r, segment: SEGMENTS[r.segment]?.label, tags: r.tags.join(", "), last_order_at: r.last_order_at ? new Date(r.last_order_at).toLocaleDateString("pt-BR") : "" })), [{ key: "name", label: "Nome" }, { key: "phone", label: "Telefone" }, { key: "email", label: "E-mail" }, { key: "segment", label: "Segmento" }, { key: "orders_count", label: "Pedidos" }, { key: "total_spent", label: "Total gasto" }, { key: "avg_ticket", label: "Ticket médio" }, { key: "points", label: "Pontos" }, { key: "last_order_at", label: "Último pedido" }, { key: "tags", label: "Tags" }])}>Exportar</Button>
          {canManage && <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Novo cliente</Button>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="users" title="Nenhum cliente encontrado" description="Clientes são cadastrados automaticamente quando fazem pedidos." />
      ) : (
        <>
          <Table>
            <thead><tr><Th>Cliente</Th><Th>Segmento</Th><Th align="right">Pedidos</Th><Th align="right">Total gasto</Th><Th align="right">Ticket médio</Th><Th align="right">Pontos</Th><Th>Último pedido</Th></tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/app/clientes/${r.id}`} className="font-medium hover:text-ember-600">{r.name}</Link>
                    <span className="block text-xs text-muted">{phone(r.phone)}{r.tags.length ? ` · ${r.tags.map((t) => `#${t}`).join(" ")}` : ""}</span>
                  </Td>
                  <Td><Badge tone={SEGMENTS[r.segment]?.tone ?? "neutral"}>{SEGMENTS[r.segment]?.label ?? r.segment}</Badge></Td>
                  <Td align="right" className="num">{r.orders_count}</Td>
                  <Td align="right" className="num font-semibold">{money(r.total_spent)}</Td>
                  <Td align="right" className="num">{money(r.avg_ticket)}</Td>
                  <Td align="right" className="num">{r.points}</Td>
                  <Td className="text-muted" >{r.last_order_at ? <span title={date(r.last_order_at, tz)}>{relative(r.last_order_at)}</span> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>{filtered.length} cliente(s)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" icon="chevron-left" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span className="num">{page}/{pages}</span>
              <Button size="sm" iconRight="chevron-right" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}
      <NewCustomerModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Novo cliente" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveCustomerAction({ name, phone: tel, email: "", birthday: null, notes: "", tags: [] }), { success: "Cliente cadastrado", onSuccess: (id) => { onClose(); if (id) router.push(`/app/clientes/${id}`); } })}>Cadastrar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Telefone (WhatsApp)"><Input inputMode="tel" value={tel} onChange={(e) => setTel(maskPhone(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}
