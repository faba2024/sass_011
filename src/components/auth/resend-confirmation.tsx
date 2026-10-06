"use client";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { resendConfirmationAction } from "@/app/(auth)/actions";

const COOLDOWN = 60;

/** Reenvio do e-mail de confirmação (auth.resend) com espera entre envios */
export function ResendConfirmation({ email, autoStartCooldown = false }: { email: string; autoStartCooldown?: boolean }) {
  const [left, setLeft] = useState(autoStartCooldown ? COOLDOWN : 0);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <div className="mt-4">
      {msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}
      <Button
        variant="secondary"
        size="md"
        loading={pending}
        disabled={left > 0 || !email}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await resendConfirmationAction(email);
            if (res.ok) {
              setMsg({ tone: "success", text: `Novo link enviado para ${email}. Confira também a caixa de spam.` });
              setLeft(COOLDOWN);
            } else {
              setMsg({ tone: "error", text: res.error ?? "Não foi possível reenviar agora." });
              if (/aguarde|tentativas/i.test(res.error ?? "")) setLeft(COOLDOWN);
            }
          })
        }
      >
        {left > 0 ? `Reenviar e-mail de confirmação (${left}s)` : "Reenviar e-mail de confirmação"}
      </Button>
    </div>
  );
}
