"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/states";
import { slugify } from "@/lib/format";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { checkSlugAction, signInAction, signUpAction } from "../actions";

export function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", storeName: "", slug: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [checking, startCheck] = useTransition();
  const [checkMsg, setCheckMsg] = useState<{ tone: "warn" | "error"; text: string } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!slugTouched) setForm((f) => ({ ...f, slug: slugify(f.storeName) }));
  }, [form.storeName, slugTouched]);

  useEffect(() => {
    if (!form.slug) return setSlugOk(null);
    const t = setTimeout(async () => {
      const res = await checkSlugAction(form.slug);
      setSlugOk(res.ok ? Boolean(res.data) : null);
    }, 400);
    return () => clearTimeout(t);
  }, [form.slug]);

  if (sent) {
    return (
      <div className="animate-pop-in">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-pickle-50 text-pickle-500">
          <Icon name="send" size={22} />
        </div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Confirme seu e-mail</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enviamos um link para <b className="text-ink">{sent}</b>. Ao confirmar, você volta direto para configurar a <b className="text-ink">{form.storeName}</b>.
        </p>
        <p className="mt-2 text-xs text-muted">Não chegou em 2 minutos? Veja a pasta de spam/promoções ou reenvie.</p>
        {checkMsg && <Notice tone={checkMsg.tone} className="mt-4">{checkMsg.text}</Notice>}
        <Button
          variant="primary"
          size="lg"
          block
          loading={checking}
          className="mt-5"
          onClick={() =>
            startCheck(async () => {
              setCheckMsg(null);
              // tenta entrar com os dados digitados agora (ficam só na memória desta tela)
              const res = await signInAction({ email: sent, password: form.password, next: "/onboarding" });
              if (res.ok) {
                router.push(res.data?.next ?? "/onboarding");
                router.refresh();
                return;
              }
              const err = res.error ?? "";
              if (err.startsWith("[email_not_confirmed]")) setCheckMsg({ tone: "warn", text: "Ainda não recebemos a confirmação. Clique no link do e-mail (ou reenvie abaixo) e tente de novo." });
              else if (/incorretos/i.test(err)) router.push(`/login?email=${encodeURIComponent(sent)}`);
              else setCheckMsg({ tone: "error", text: err });
            })
          }
        >
          Já confirmei — entrar
        </Button>
        <ResendConfirmation email={sent} autoStartCooldown />
        <button type="button" onClick={() => { setSent(null); setCheckMsg(null); }} className="mt-6 block text-sm font-medium text-ember-600 hover:underline">
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form
      className="animate-pop-in"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await signUpAction(form);
          if (!res.ok) return setError(res.error ?? "Não foi possível criar a conta");
          if (res.data?.needsConfirmation) return setSent(res.data.email);
          router.push("/onboarding");
          router.refresh();
        });
      }}
    >
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Comece a vender hoje</h1>
      <p className="mt-1 text-sm text-muted">15 dias grátis com todos os recursos. Sem cartão de crédito.</p>
      {error && <Notice tone="error" className="mt-5">{error}</Notice>}
      <div className="mt-6 space-y-4">
        <Field label="Nome da hamburgueria" htmlFor="store" required>
          <Input id="store" required value={form.storeName} onChange={(e) => set("storeName", e.target.value)} placeholder="Ex.: Brasa Burger" className="h-11" />
        </Field>
        <Field
          label="Endereço do cardápio"
          htmlFor="slug"
          required
          error={slugOk === false ? "Endereço indisponível" : null}
          help={form.slug ? <span className="font-mono">/{form.slug}</span> : "Será o link do seu cardápio online"}
        >
          <Input
            id="slug"
            required
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
            suffix={slugOk === true ? "✓ livre" : undefined}
            invalid={slugOk === false}
            className="h-11 font-mono"
          />
        </Field>
        <Field label="Seu nome" htmlFor="name" required>
          <Input id="name" autoComplete="name" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className="h-11" />
        </Field>
        <Field label="E-mail" htmlFor="email" required>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className="h-11" />
        </Field>
        <Field label="Senha" htmlFor="password" required help="Mínimo de 8 caracteres">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} className="h-11" />
        </Field>
      </div>
      <Button type="submit" variant="primary" size="lg" block loading={pending} disabled={slugOk === false} className="mt-6">
        Criar minha conta
      </Button>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-ember-600 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
