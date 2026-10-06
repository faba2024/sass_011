"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { storeUrl } from "@/lib/env";
import { dateTime, phone } from "@/lib/format";
import { TEMPLATE_VARS, renderTemplate } from "@/lib/whatsapp";
import { deleteTemplateAction, saveTemplateAction } from "./actions";

type T = { id: string; key: string; name: string; body: string; is_active: boolean };
const SAMPLE = (org: string, slug: string) => ({ cliente: "Fabricio", numero: "1058", total: "R$ 77,80", link: storeUrl(slug, "/pedido/exemplo"), previsao: "35–50 min", pagamento: "Pagamento: Pix.", loja: org, endereco: "Rua das Flores, 120 · Centro" });

export function TemplatesManager({ templates, log, orgName, slug, whatsapp, tz }: { templates: T[]; log: { id: string; template_key: string | null; phone: string; body: string; created_at: string; order_id: string | null }[]; orgName: string; slug: string; whatsapp: string | null; tz: string }) {
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div>
        {!whatsapp && <Notice tone="warn" className="mb-3">Cadastre o WhatsApp da loja em <Link href="/app/configuracoes" className="font-medium underline">Configurações</Link> para o botão “Falar com a hamburgueria” aparecer no cardápio.</Notice>}
        <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Novo template</Button></div>
        {templates.length === 0 ? <EmptyState icon="whatsapp" title="Nenhum template" /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{t.name}</p><p className="font-mono text-[11px] text-muted">{t.key}</p></div>
                  {!t.is_active && <Badge>Inativo</Badge>}
                </div>
                <p className="mt-2 rounded-lg bg-[#e7f6e1] px-3 py-2 text-[13px]">{renderTemplate(t.body, SAMPLE(orgName, slug))}</p>
                <div className="mt-3 flex gap-1">
                  <Button size="sm" icon="edit" onClick={() => setEditing(t)}>Editar</Button>
                  <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir "${t.name}"?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteTemplateAction(t.id), { success: "Template excluído" }); }} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Card>
        <CardHeader title="Últimas mensagens enviadas" description="Registradas quando a equipe usa um template" />
        {log.length === 0 ? <p className="text-[13px] text-muted">Nenhuma ainda. Use o botão WhatsApp no detalhe do pedido.</p> : (
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto text-[13px]">
            {log.map((m) => (
              <li key={m.id} className="py-2">
                <p className="flex justify-between gap-2 text-xs text-muted"><span>{phone(m.phone)}{m.template_key ? ` · ${m.template_key}` : ""}</span><span>{dateTime(m.created_at, tz)}</span></p>
                <p className="line-clamp-2 text-ink-2">{m.body}</p>
                {m.order_id && <Link href={`/app/pedidos/${m.order_id}`} className="text-xs text-ember-600 hover:underline">ver pedido</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TemplateModal value={editing} orgName={orgName} slug={slug} onClose={() => setEditing(null)} />
    </div>
  );
}

function TemplateModal({ value, orgName, slug, onClose }: { value: T | "new" | null; orgName: string; slug: string; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ key: "", name: "", body: "", is_active: true });
  useEffect(() => { if (value && value !== "new") setF({ key: value.key, name: value.name, body: value.body, is_active: value.is_active }); else setF({ key: "", name: "", body: "", is_active: true }); }, [value]);
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Novo template" : "Editar template"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveTemplateAction(f, value && value !== "new" ? value.id : null), { success: "Template salvo", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Chave" help="Ex.: pedido_atrasado"><Input disabled={value !== "new"} className="font-mono" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z_]/g, "_") })} /></Field>
        </div>
        <Field label="Mensagem" required>
          <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="mt-1.5 flex flex-wrap gap-1">{TEMPLATE_VARS.map((v) => <button key={v} type="button" onClick={() => setF({ ...f, body: `${f.body}{{${v}}}` })} className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:bg-sunken">{`{{${v}}}`}</button>)}</div>
        </Field>
        {f.body && <div className="rounded-lg bg-[#e7f6e1] p-3 text-[13px]"><p className="mb-1 text-[11px] font-medium uppercase text-muted">Prévia</p>{renderTemplate(f.body, SAMPLE(orgName, slug))}</div>}
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Ativo <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></label>
      </div>
    </Modal>
  );
}
