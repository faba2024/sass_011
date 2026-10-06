"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { useAction } from "@/hooks/use-action";
import { SEGMENTS } from "@/lib/constants";
import { storeUrl } from "@/lib/env";
import { date, phone } from "@/lib/format";
import { renderTemplate, waLink } from "@/lib/whatsapp";
import { buildRecipientsAction, deleteCampaignAction, finishCampaignAction, markRecipientSentAction, saveCampaignAction } from "./actions";

export interface Campaign { id: string; name: string; segment: string; tag: string | null; message: string; status: "draft" | "sending" | "done"; created_at: string; campaign_recipients: { id: string; name: string; phone: string; sent_at: string | null }[] }
const SEG_LABEL: Record<string, string> = { all: "Todos os clientes", tag: "Por tag", ...Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, v.label])) };
const STATUS = { draft: { label: "Rascunho", tone: "neutral" as const }, sending: { label: "Enviando", tone: "mustard" as const }, done: { label: "Concluída", tone: "green" as const } };
const IDEAS = [
  { name: "Sentimos sua falta", segment: "inactive", message: "Oi, {{cliente}}! Faz tempo que você não pede na {{loja}}. Hoje tem cupom VOLTA10 com 10% off pra matar a saudade 🍔 {{link}}" },
  { name: "Obrigado, VIP", segment: "vip", message: "{{cliente}}, você é cliente VIP da {{loja}}! Seu próximo pedido tem batata grátis com o cupom BATATAFREE. {{link}}" },
  { name: "Boas-vindas", segment: "new", message: "Valeu pelo primeiro pedido, {{cliente}}! Volte quando bater a fome: {{link}}" },
];

export function CampaignsManager({ campaigns, counts, tags, orgName, slug }: { campaigns: Campaign[]; counts: Record<string, number>; tags: string[]; orgName: string; slug: string }) {
  const [editing, setEditing] = useState<Campaign | Partial<Campaign> | null>(null);
  const [sending, setSending] = useState<Campaign | null>(null);
  const { run, pending } = useAction();
  const confirm = useConfirm();
  useEffect(() => {
    if (sending) setSending(campaigns.find((c) => c.id === sending.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);
  return (
    <>
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {IDEAS.map((i) => (
          <button key={i.name} type="button" onClick={() => setEditing({ name: i.name, segment: i.segment, message: i.message, tag: null })} className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-left hover:border-ember-400">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Ideia · {SEG_LABEL[i.segment]} ({counts[i.segment] ?? 0})</p>
            <p className="mt-1 font-medium">{i.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{i.message}</p>
          </button>
        ))}
      </div>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing({ name: "", segment: "inactive", message: "", tag: null })}>Nova campanha</Button></div>
      {campaigns.length === 0 ? <EmptyState icon="megaphone" title="Nenhuma campanha" description="Reative clientes inativos e mime os VIPs com mensagens prontas." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {campaigns.map((c) => {
            const sent = c.campaign_recipients.filter((r) => r.sent_at).length;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{SEG_LABEL[c.segment]}{c.tag ? ` #${c.tag}` : ""} · criada em {date(c.created_at)}</p></div>
                  <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                </div>
                <p className="mt-2 line-clamp-3 rounded-md bg-paper px-3 py-2 text-[13px] text-ink-2">{c.message}</p>
                {c.campaign_recipients.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-pickle-500" style={{ width: `${(sent / c.campaign_recipients.length) * 100}%` }} /></div>
                    <p className="num mt-1 text-xs text-muted">{sent} de {c.campaign_recipients.length} enviados</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === "draft" ? (
                    <Button size="sm" variant="primary" icon="users" loading={pending} onClick={() => run(() => buildRecipientsAction(c.id), { success: "Lista de envio pronta" , onSuccess: () => setSending(c) })}>Gerar lista de envio</Button>
                  ) : (
                    <Button size="sm" variant="dark" icon="send" onClick={() => setSending(c)}>Enviar mensagens</Button>
                  )}
                  {c.status === "draft" && <Button size="sm" icon="edit" onClick={() => setEditing(c)}>Editar</Button>}
                  <Button size="sm" variant="ghost" className="text-ketchup-500" icon="trash" onClick={async () => { if (await confirm({ title: `Excluir "${c.name}"?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteCampaignAction(c.id), { success: "Campanha excluída" }); }}>Excluir</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <CampaignModal value={editing} counts={counts} tags={tags} orgName={orgName} slug={slug} onClose={() => setEditing(null)} />
      <SendSheet campaign={sending} orgName={orgName} slug={slug} onClose={() => setSending(null)} />
    </>
  );
}

function CampaignModal({ value, counts, tags, orgName, slug, onClose }: { value: Partial<Campaign> | null; counts: Record<string, number>; tags: string[]; orgName: string; slug: string; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", segment: "inactive", tag: "", message: "" });
  useEffect(() => { if (value) setF({ name: value.name ?? "", segment: value.segment ?? "inactive", tag: value.tag ?? "", message: value.message ?? "" }); }, [value]);
  const preview = renderTemplate(f.message, { cliente: "Ana", loja: orgName, link: storeUrl(slug) });
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value?.id ? "Editar campanha" : "Nova campanha"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={() => run(() => saveCampaignAction({ ...f, segment: f.segment as "all" }, value?.id ?? null), { success: "Campanha salva", onSuccess: onClose })}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Público"><Select value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })}>{Object.entries(SEG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{k !== "tag" ? ` (${counts[k] ?? 0})` : ""}</option>)}</Select></Field>
          {f.segment === "tag" && <Field label="Tag"><Select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}><option value="">Selecione…</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</Select></Field>}
        </div>
        <Field label="Mensagem" required help="Variáveis: {{cliente}}, {{loja}}, {{link}}"><Textarea rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        {f.message && <div className="rounded-lg bg-[#e7f6e1] p-3 text-[13px] text-ink"><p className="mb-1 text-[11px] font-medium uppercase text-muted">Prévia</p>{preview}</div>}
      </div>
    </Modal>
  );
}

function SendSheet({ campaign, orgName, slug, onClose }: { campaign: Campaign | null; orgName: string; slug: string; onClose: () => void }) {
  const { run } = useAction();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  useEffect(() => setLocal({}), [campaign?.id]);
  const recips = useMemo(() => campaign?.campaign_recipients ?? [], [campaign]);
  if (!campaign) return null;
  const isSent = (r: Campaign["campaign_recipients"][number]) => local[r.id] ?? Boolean(r.sent_at);
  const done = recips.filter(isSent).length;
  return (
    <Sheet open onClose={onClose} width="lg" mobile="full" title={campaign.name} description={`${done} de ${recips.length} enviados`}
      footer={<div className="flex justify-between gap-2"><span className="text-xs text-muted">Toque em “Enviar”: o WhatsApp abre com a mensagem pronta.</span><Button variant="success" onClick={() => run(() => finishCampaignAction(campaign.id), { success: "Campanha concluída", onSuccess: onClose })}>Concluir campanha</Button></div>}>
      <ul className="divide-y divide-line">
        {recips.map((r) => {
          const msg = renderTemplate(campaign.message, { cliente: r.name.split(" ")[0], loja: orgName, link: storeUrl(slug) });
          const sent = isSent(r);
          return (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{r.name}</p><p className="text-xs text-muted">{phone(r.phone)}</p></div>
              {sent && <Badge tone="green">Enviado</Badge>}
              <a href={waLink(r.phone, msg)} target="_blank" rel="noreferrer" onClick={() => { setLocal((l) => ({ ...l, [r.id]: true })); void markRecipientSentAction(r.id, true); }} className="inline-flex h-8 items-center rounded-md bg-pickle-500 px-3 text-xs font-semibold text-white hover:bg-pickle-700">Enviar</a>
              {sent && <button type="button" onClick={() => { setLocal((l) => ({ ...l, [r.id]: false })); void markRecipientSentAction(r.id, false); }} className="text-xs text-muted hover:underline">desfazer</button>}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
