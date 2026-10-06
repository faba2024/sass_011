"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { requestPasswordResetAction } from "../actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="animate-pop-in"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await requestPasswordResetAction(email);
          if (!res.ok) return setError(res.error ?? "Erro");
          setDone(true);
        });
      }}
    >
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Recuperar senha</h1>
      <p className="mt-1 text-sm text-muted">Enviaremos um link para você criar uma nova senha.</p>
      {done && <Notice tone="success" className="mt-5">Se houver uma conta com este e-mail, o link chegará em instantes.</Notice>}
      {error && <Notice tone="error" className="mt-5">{error}</Notice>}
      <Field label="E-mail" htmlFor="email" className="mt-6">
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </Field>
      <Button type="submit" variant="dark" size="lg" block loading={pending} className="mt-6">
        Enviar link
      </Button>
      <Link href="/login" className="mt-6 block text-center text-sm font-medium text-ember-600 hover:underline">
        Voltar para o login
      </Link>
    </form>
  );
}
