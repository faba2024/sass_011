"use client";
import { useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useAction } from "@/hooks/use-action";
import { maskCnpj, maskPhone, phone } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { deleteSupplierAction, saveSupplierAction } from "./actions";

export interface Supplier { id: string; name: string; cnpj: string | null; phone: string | null; whatsapp: string | null; email: string | null; products_text: string | null; notes: string | null }

export function SuppliersManager({ suppliers, counts, canManage }: { suppliers: Supplier[]; counts: Record<string, number>; canManage: boolean }) {
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [q, setQ] = useState("");
  const { run } = useAction();
  const confirm = useConfirm();
  const list = suppliers.filter((s) => !q || `${s.name} ${s.products_text ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-full sm:w-64"><Input icon="search" placeholder="Buscar fornecedor ou produto…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {canManage && <Button variant="primary" icon="plus" className="ml-auto" onClick={() => setEditing("new")}>Novo fornecedor</Button>}
      </div>
      {list.length === 0 ? (
        <EmptyState icon="truck" title="Nenhum fornecedor" description="Cadastre frigorífico, padaria e distribuidora de bebidas." action={canManage && <Button variant="primary" onClick={() => setEditing("new")}>Cadastrar</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <article key={s.id} className="rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="text-xs text-muted">{s.cnpj ? `CNPJ ${s.cnpj}` : "Sem CNPJ"} · {counts[s.id] ?? 0} insumo(s)</p></div>
                {canManage && (
                  <div className="flex">
                    <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(s)} />
                    <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir ${s.name}?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteSupplierAction(s.id), { success: "Fornecedor excluído" }); }} />
                  </div>
                )}
              </div>
              {s.products_text && <p className="mt-2 text-[13px] text-ink-2">{s.products_text}</p>}
              {s.notes && <p className="mt-1 text-xs text-muted">{s.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
                {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-ink-2 hover:text-ink"><Icon name="phone" size={14} />{phone(s.phone)}</a>}
                {s.whatsapp && <a href={waLink(s.whatsapp)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-pickle-700 hover:underline"><Icon name="whatsapp" size={14} />WhatsApp</a>}
                {s.email && <a href={`mailto:${s.email}`} className="truncate text-ink-2 hover:underline">{s.email}</a>}
              </div>
            </article>
          ))}
        </div>
      )}
      <SupplierModal value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SupplierModal({ value, onClose }: { value: Supplier | "new" | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const empty = { name: "", cnpj: "", phone: "", whatsapp: "", email: "", products_text: "", notes: "" };
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (value && value !== "new") setF({ name: value.name, cnpj: value.cnpj ?? "", phone: maskPhone(value.phone ?? ""), whatsapp: maskPhone(value.whatsapp ?? ""), email: value.email ?? "", products_text: value.products_text ?? "", notes: value.notes ?? "" });
    else setF(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Novo fornecedor" : "Editar fornecedor"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveSupplierAction(f, value && value !== "new" ? value.id : null), { success: "Fornecedor salvo", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="CNPJ"><Input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: maskCnpj(e.target.value) })} /></Field>
        <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefone"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
        <Field label="WhatsApp"><Input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: maskPhone(e.target.value) })} /></Field>
        <Field label="Produtos que fornece" className="sm:col-span-2"><Input value={f.products_text} onChange={(e) => setF({ ...f, products_text: e.target.value })} placeholder="Blend bovino, bacon, frango" /></Field>
        <Field label="Observações" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Dias de entrega, prazo, pedido mínimo…" /></Field>
      </div>
    </Modal>
  );
}
