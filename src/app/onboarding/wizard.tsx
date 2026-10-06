"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { HoursEditor, type Shift } from "@/components/settings/hours-editor";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { ImageUpload } from "@/components/ui/image-upload";
import { Logo } from "@/components/ui/logo";
import { useAction } from "@/hooks/use-action";
import { storeUrl } from "@/lib/env";
import { maskCep, maskPhone, money, slugify } from "@/lib/format";
import { lookupCep } from "@/lib/storefront-client";
import type { Organization } from "@/lib/types";
import { cn, readableOn } from "@/lib/utils";
import { checkSlugAction } from "@/app/(auth)/actions";
import { createOrganizationAction, finishOnboardingAction, stepAddressAction, stepBrandAction, stepDeliveryAction, stepHoursAction, stepIdentityAction, stepProductAction } from "./actions";

const STEPS = ["Nome", "Logo", "Endereço", "Horário", "Entrega", "Primeiro produto"];

type Props =
  | { mode: "create"; pending: { name: string; slug: string } }
  | { mode: "setup"; org: Organization; hours: Shift[]; hasZone: boolean; hasProduct: boolean };

export function OnboardingWizard(props: Props) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          {props.mode === "setup" && <Link href="/app" className="text-[13px] font-medium text-muted hover:text-ink">Terminar depois</Link>}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">{props.mode === "create" ? <CreateOrg pending={props.pending} /> : <Setup {...props} />}</main>
    </div>
  );
}

function CreateOrg({ pending: initial }: { pending: { name: string; slug: string } }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: initial.name, slug: initial.slug || slugify(initial.name) });
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (f.slug.length < 3) return setOk(null);
    const t = setTimeout(async () => {
      const r = await checkSlugAction(f.slug);
      setOk(r.ok ? Boolean(r.data) : null);
    }, 350);
    return () => clearTimeout(t);
  }, [f.slug]);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Vamos criar sua hamburgueria</h1>
      <p className="mt-2 text-[15px] text-muted">Seu e-mail foi confirmado. Falta só dar nome à loja — você ganha 15 dias grátis com todos os recursos.</p>
      <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => createOrganizationAction(f), { onSuccess: () => router.refresh() }); }}>
        <Field label="Nome da hamburgueria" required><Input value={f.name} onChange={(e) => setF({ name: e.target.value, slug: slugify(e.target.value) })} autoFocus /></Field>
        <Field label="Endereço do cardápio" error={ok === false ? "Endereço indisponível" : null} help={<span className="font-mono">{storeUrl(f.slug || "sua-loja")}</span>}>
          <Input value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} invalid={ok === false} suffix={ok ? "✓ livre" : undefined} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={pending} disabled={ok === false || f.name.trim().length < 2}>Criar hamburgueria</Button>
      </form>
    </div>
  );
}

function Setup({ org, hours, hasZone, hasProduct }: { org: Organization; hours: Shift[]; hasZone: boolean; hasProduct: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [step, setStep] = useState(Math.min(org.onboarding_step, 5));
  const done = (n: number) => () => setStep(Math.min(n + 1, 6));

  // Estado de cada etapa
  const [identity, setIdentity] = useState({ name: org.name, description: org.description ?? "", whatsapp: maskPhone(org.whatsapp ?? "") });
  const [brand, setBrand] = useState({ logo_url: org.logo_url, primary_color: org.primary_color, secondary_color: org.secondary_color });
  const [addr, setAddr] = useState({ address_zip: maskCep(org.address_zip ?? ""), address_street: org.address_street ?? "", address_number: org.address_number ?? "", address_district: org.address_district ?? "", address_complement: org.address_complement ?? "", address_city: org.address_city ?? "", address_state: org.address_state ?? "" });
  const [shifts, setShifts] = useState<Shift[]>(hours.length ? hours : [2, 3, 4, 5, 6, 0].map((wd) => ({ weekday: wd, opens_at: "18:00", closes_at: "23:30" })));
  const [delivery, setDelivery] = useState({ accepts_delivery: org.accepts_delivery, accepts_pickup: org.accepts_pickup, zone: { name: org.address_district || "Bairros próximos", fee: 6 as number | null, eta_min: 35, eta_max: 55 } });
  const [product, setProduct] = useState({ category: "Hambúrgueres", name: "", description: "", price: null as number | null, image: null as string | null });
  const [cepBusy, setCepBusy] = useState(false);

  async function fillCep(v: string) {
    const masked = maskCep(v);
    setAddr((a) => ({ ...a, address_zip: masked }));
    if (masked.replace(/\D/g, "").length !== 8) return;
    setCepBusy(true);
    const r = await lookupCep(masked);
    setCepBusy(false);
    if (r) setAddr((a) => ({ ...a, address_street: r.street || a.address_street, address_district: r.district || a.address_district, address_city: r.city, address_state: r.state }));
  }

  const finished = step >= 6;
  const pct = Math.round((Math.min(step, 6) / 6) * 100);

  return (
    <>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">{finished ? "Tudo pronto" : `Etapa ${step + 1} de 6`}</p>
          <p className="num text-xs font-semibold text-ember-600">{pct}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-ember-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-3 hidden grid-cols-6 gap-2 sm:grid">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" disabled={i > org.onboarding_step && i > step} onClick={() => setStep(i)} className={cn("w-full text-left text-[12px] disabled:cursor-default", i === step ? "font-semibold text-ink" : i < step ? "text-ink-2" : "text-muted")}>
                {i < step && <Icon name="check" size={12} className="mr-1 inline text-pickle-500" />}
                {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-8">
        {step === 0 && (
          <StepShell title="Como sua hamburgueria se chama?" text="É o nome que o cliente vê no cardápio, no acompanhamento do pedido e nas mensagens.">
            <Field label="Nome" required><Input value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} /></Field>
            <Field label="Frase de apresentação" help="Ex.: Smash burger na chapa, entrega rápida no centro"><Textarea rows={2} maxLength={500} value={identity.description} onChange={(e) => setIdentity({ ...identity, description: e.target.value })} /></Field>
            <Field label="WhatsApp da loja" help="Para o cliente falar com você e para enviar avisos do pedido"><Input inputMode="tel" value={identity.whatsapp} onChange={(e) => setIdentity({ ...identity, whatsapp: maskPhone(e.target.value) })} placeholder="(71) 99999-0000" /></Field>
            <Nav pending={pending} onNext={() => run(() => stepIdentityAction(identity), { onSuccess: done(0) })} />
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="Sua marca" text="Envie o logo e escolha as cores do cardápio. Dá pra trocar depois em Configurações.">
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <ImageUpload orgId={org.id} folder="brand" value={brand.logo_url} onChange={(v) => setBrand({ ...brand, logo_url: v })} maxSize={800} label="Enviar logo" />
              <div className="space-y-4">
                <ColorField label="Cor principal" value={brand.primary_color} onChange={(v) => setBrand({ ...brand, primary_color: v })} />
                <ColorField label="Cor secundária" value={brand.secondary_color} onChange={(v) => setBrand({ ...brand, secondary_color: v })} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {[["#E2501C", "#1F1A17"], ["#C8102E", "#F2B705"], ["#1F6F43", "#F4E9D8"], ["#2D2A6E", "#FF8A3D"], ["#111111", "#F7C948"]].map(([a, b]) => (
                    <button key={a} type="button" aria-label={`Paleta ${a}`} onClick={() => setBrand({ ...brand, primary_color: a, secondary_color: b })} className="flex overflow-hidden rounded-md border border-line">
                      <span className="h-7 w-7" style={{ background: a }} /><span className="h-7 w-7" style={{ background: b }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Nav pending={pending} onBack={() => setStep(0)} onNext={() => run(() => stepBrandAction(brand), { onSuccess: done(1) })} />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Onde fica a loja?" text="Usado na retirada, no rodapé do cardápio e como ponto de partida das entregas.">
            <div className="grid gap-4 sm:grid-cols-[150px_1fr_110px]">
              <Field label="CEP" required hint={cepBusy ? "buscando…" : undefined}><Input inputMode="numeric" value={addr.address_zip} onChange={(e) => fillCep(e.target.value)} /></Field>
              <Field label="Rua" required><Input value={addr.address_street} onChange={(e) => setAddr({ ...addr, address_street: e.target.value })} /></Field>
              <Field label="Número" required><Input value={addr.address_number} onChange={(e) => setAddr({ ...addr, address_number: e.target.value })} /></Field>
              <Field label="Bairro" required className="sm:col-span-2"><Input value={addr.address_district} onChange={(e) => setAddr({ ...addr, address_district: e.target.value })} /></Field>
              <Field label="Complemento"><Input value={addr.address_complement} onChange={(e) => setAddr({ ...addr, address_complement: e.target.value })} /></Field>
              <Field label="Cidade" required className="sm:col-span-2"><Input value={addr.address_city} onChange={(e) => setAddr({ ...addr, address_city: e.target.value })} /></Field>
              <Field label="UF" required><Input maxLength={2} value={addr.address_state} onChange={(e) => setAddr({ ...addr, address_state: e.target.value.toUpperCase() })} /></Field>
            </div>
            <Nav pending={pending} onBack={() => setStep(1)} onNext={() => run(() => stepAddressAction(addr), { onSuccess: done(2) })} />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Horário de funcionamento" text="O cardápio abre e fecha sozinho. Turnos que passam da meia-noite são aceitos.">
            <HoursEditor value={shifts} onChange={setShifts} />
            <Nav pending={pending} onBack={() => setStep(2)} onNext={() => run(() => stepHoursAction(shifts), { onSuccess: done(3) })} />
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Entrega e retirada" text="Escolha como o cliente recebe. Depois você cadastra mais bairros com taxas diferentes em Áreas de entrega.">
            <div className="space-y-3">
              <Checkbox checked={delivery.accepts_delivery} onChange={(v) => setDelivery({ ...delivery, accepts_delivery: v })} label="Faço entrega" />
              <Checkbox checked={delivery.accepts_pickup} onChange={(v) => setDelivery({ ...delivery, accepts_pickup: v })} label="Cliente pode retirar no balcão" />
            </div>
            {delivery.accepts_delivery && !hasZone && (
              <div className="grid gap-4 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2">
                <p className="text-[13px] font-medium sm:col-span-2">Primeira área de entrega</p>
                <Field label="Nome da área" className="sm:col-span-2"><Input value={delivery.zone.name} onChange={(e) => setDelivery({ ...delivery, zone: { ...delivery.zone, name: e.target.value } })} /></Field>
                <Field label="Taxa de entrega"><MoneyInput value={delivery.zone.fee} onChange={(v) => setDelivery({ ...delivery, zone: { ...delivery.zone, fee: v } })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tempo mín." hint="min"><Input type="number" min={0} value={delivery.zone.eta_min} onChange={(e) => setDelivery({ ...delivery, zone: { ...delivery.zone, eta_min: Number(e.target.value) } })} /></Field>
                  <Field label="Tempo máx." hint="min"><Input type="number" min={0} value={delivery.zone.eta_max} onChange={(e) => setDelivery({ ...delivery, zone: { ...delivery.zone, eta_max: Number(e.target.value) } })} /></Field>
                </div>
              </div>
            )}
            {delivery.accepts_delivery && hasZone && <p className="text-[13px] text-muted">Você já tem áreas de entrega cadastradas.</p>}
            <Nav pending={pending} onBack={() => setStep(3)} onNext={() => run(() => stepDeliveryAction({ accepts_delivery: delivery.accepts_delivery, accepts_pickup: delivery.accepts_pickup, zone: delivery.accepts_delivery && !hasZone ? { ...delivery.zone, fee: delivery.zone.fee ?? 0 } : null }), { onSuccess: done(4) })} />
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Seu primeiro produto" text={hasProduct ? "Você já tem produtos no cardápio. Pode cadastrar mais um aqui ou concluir." : "Cadastre o burger carro-chefe. Adicionais, combos e ficha técnica ficam no Cardápio."}>
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <ImageUpload orgId={org.id} folder="products" value={product.image} onChange={(v) => setProduct({ ...product, image: v })} label="Foto do produto" />
              <div className="space-y-4">
                <Field label="Categoria" required><Input value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} /></Field>
                <Field label="Nome" required><Input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Ex.: Smash Duplo" /></Field>
                <Field label="Preço" required><MoneyInput value={product.price} onChange={(v) => setProduct({ ...product, price: v })} /></Field>
              </div>
            </div>
            <Field label="Descrição"><Textarea rows={2} value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} placeholder="Pão brioche, 2 smash de 90 g, cheddar, picles da casa e molho especial" /></Field>
            {product.name && product.price ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3 text-[13px]">
                <span className="font-medium">{product.name}</span><span className="num ml-auto font-semibold">{money(product.price)}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <Button variant="ghost" onClick={() => setStep(4)} icon="chevron-left">Voltar</Button>
              <div className="flex gap-2">
                {hasProduct && <Button variant="secondary" loading={pending} onClick={() => run(() => finishOnboardingAction(), { onSuccess: () => setStep(6) })}>Concluir sem cadastrar</Button>}
                <Button variant="primary" loading={pending} onClick={() => run(async () => { const r = await stepProductAction({ ...product, price: product.price ?? 0 }); return r.ok ? finishOnboardingAction() : r; }, { onSuccess: () => setStep(6) })}>Salvar e concluir</Button>
              </div>
            </div>
          </StepShell>
        )}

        {finished && (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-pickle-50 text-pickle-500"><Icon name="check" size={28} /></div>
            <h2 className="mt-4 font-display text-2xl font-semibold">Cardápio no ar</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">Compartilhe o link no Instagram e no WhatsApp. Os pedidos chegam no painel em tempo real.</p>
            <p className="mt-4 break-all font-mono text-[14px] font-semibold">{storeUrl(org.slug)}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <a href={storeUrl(org.slug)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-[14px] font-medium hover:bg-paper">Ver meu cardápio</a>
              <Button variant="primary" onClick={() => router.push("/app")}>Ir para o painel</Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StepShell({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 text-[14px] text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}

function Nav({ onBack, onNext, pending }: { onBack?: () => void; onNext: () => void; pending: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-line pt-5">
      {onBack ? <Button variant="ghost" onClick={onBack} icon="chevron-left">Voltar</Button> : <span />}
      <Button variant="primary" loading={pending} onClick={onNext} iconRight="chevron-right">Continuar</Button>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        <span className="rounded-md px-3 py-2 text-xs font-bold" style={{ background: valid ? value : "#000", color: readableOn(valid ? value : "#000000") }}>Aa</span>
      </div>
    </Field>
  );
}
