"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { updatePasswordAction } from "../actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="animate-pop-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) return setError("As senhas não conferem");
        setError(null);
        start(async () => {
          const res = await updatePasswordAction(password);
          if (!res.ok) return setError(res.error ?? "Erro");
          router.push("/app");
          router.refresh();
        });
      }}
    >
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Nova senha</h1>
      <p className="mt-1 text-sm text-muted">Escolha uma senha com pelo menos 8 caracteres.</p>
      {error && <Notice tone="error" className="mt-5">{error}</Notice>}
      <div className="mt-6 space-y-4">
        <Field label="Nova senha" htmlFor="p1">
          <Input id="p1" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </Field>
        <Field label="Repita a senha" htmlFor="p2">
          <Input id="p2" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" />
        </Field>
      </div>
      <Button type="submit" variant="dark" size="lg" block loading={pending} className="mt-6">
        Salvar nova senha
      </Button>
    </form>
  );
}
