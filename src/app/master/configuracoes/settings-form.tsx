"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Card, Section } from "@/components/ui/layout";
import { useAction } from "@/hooks/use-action";
import { maskPhone } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { env } from "@/lib/env";
import { removePlatformPaymentAction, savePlatformPaymentAction, savePlatformSettingsAction, testPlatformPaymentAction, type PlatformPaymentStatus } from "../actions";

type S = { signup: { enabled: boolean; plan_code: string; trial_days: number }; support: { whatsapp: string; email: string; hours: string } };

export function PlatformSettingsForm({ initial, plans }: { initial: S; plans: { code: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [f, setF] = useState<S>({ ...initial, support: { ...initial.support, whatsapp: maskPhone(initial.support.whatsapp) } });
  return (
    <>
      <Section title="Cadastro de novas hamburguerias" description="Vale para quem se cadastra pela página inicial.">
        <div className="space-y-4">
          <Checkbox checked={f.signup.enabled} onChange={(v) => setF({ ...f, signup: { ...f.signup, enabled: v } })} label="Aceitar novos cadastros" description="Desligado: o formulário de cadastro informa que as inscrições estão fechadas." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plano do período de teste"><Select value={f.signup.plan_code} onChange={(e) => setF({ ...f, signup: { ...f.signup, plan_code: e.target.value } })}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
            <Field label="Dias de teste grátis"><Input type="number" min={0} max={90} value={f.signup.trial_days} onChange={(e) => setF({ ...f, signup: { ...f.signup, trial_days: Number(e.target.value) } })} /></Field>
          </div>
        </div>
      </Section>
      <Section title="Suporte" description="Mostrado na página inicial e na tela de plano das empresas.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="WhatsApp"><Input value={f.support.whatsapp} onChange={(e) => setF({ ...f, support: { ...f.support, whatsapp: maskPhone(e.target.value) } })} /></Field>
          <Field label="E-mail"><Input type="email" value={f.support.email} onChange={(e) => setF({ ...f, support: { ...f.support, email: e.target.value } })} /></Field>
          <Field label="Horário de atendimento"><Input value={f.support.hours} onChange={(e) => setF({ ...f, support: { ...f.support, hours: e.target.value } })} /></Field>
        </div>
      </Section>
      <div className="flex justify-end"><Button variant="dark" size="lg" loading={pending} onClick={() => run(() => savePlatformSettingsAction(f), { success: "Configurações salvas" })}>Salvar</Button></div>
    </>
  );
}

/** Conta Mercado Pago que recebe as mensalidades das hamburguerias (Pix). */
export function PlatformPaymentForm({ status }: { status: PlatformPaymentStatus }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const webhook = `${env.appUrl}/api/webhooks/mercadopago?scope=platform`;
  return (
    <Section title="Recebimento das mensalidades (Mercado Pago)" description="As hamburguerias pagam a assinatura com Pix em Configurações → Assinatura. O dinheiro cai na sua conta e a fatura é baixada sozinha.">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {status.configured ? (
            <>
              <Badge tone="green" dot>Conectado</Badge>
              <Badge tone={status.live_mode ? "ember" : "blue"}>{status.live_mode ? "Produção" : "Teste (sandbox)"}</Badge>
              <span className="text-[13px] text-muted">Token terminando em <span className="font-mono">{status.token_hint}</span>{status.has_webhook_secret ? " · webhook assinado" : ""}</span>
            </>
          ) : (
            <span className="text-[13px] text-muted">Nenhuma conta conectada. Enquanto isso, o botão “Pagar” das lojas avisa que o pagamento online ainda não está ativo e a baixa continua manual em Assinaturas.</span>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Access Token" help={status.configured ? "Deixe vazio para manter o atual" : "Mercado Pago → Suas integrações → Credenciais"}>
            <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="APP_USR-… ou TEST-…" />
          </Field>
          <Field label="Assinatura secreta do webhook" help="Opcional, recomendado">
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={status.has_webhook_secret ? "•••••••• (mantida)" : ""} />
          </Field>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-[13px]">
          <p className="font-medium">URL de notificação (webhook)</p>
          <p className="mt-1 break-all font-mono text-[12px]">{webhook}</p>
          <p className="mt-1 text-xs text-muted">Cadastre em Mercado Pago → Suas integrações → Webhooks, evento “Pagamentos” (precisa de HTTPS). Em localhost a tela da loja confere o pagamento a cada 6 segundos.</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {status.configured && (
            <>
              <Button variant="ghost" className="text-ketchup-500" disabled={pending} onClick={async () => { if (await confirm({ title: "Desconectar o Mercado Pago?", description: "As lojas deixam de pagar a mensalidade online. Faturas já pagas não mudam.", tone: "danger", confirmLabel: "Desconectar" })) run(() => removePlatformPaymentAction(), { success: "Mercado Pago desconectado" }); }}>Desconectar</Button>
              <Button variant="secondary" loading={pending} onClick={() => run(() => testPlatformPaymentAction(), { refresh: false, onSuccess: (d) => toast.success(`Conexão OK${d?.nickname ? ` · conta ${d.nickname}` : ""}`) })}>Testar conexão</Button>
            </>
          )}
          <Button variant="dark" loading={pending} onClick={() => run(() => savePlatformPaymentAction({ access_token: token, webhook_secret: secret }), { success: "Recebimento salvo", onSuccess: () => { setToken(""); setSecret(""); } })}>Salvar</Button>
        </div>
      </Card>
    </Section>
  );
}
