"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-lg place-items-center px-6">
      <ErrorState
        title="Algo deu errado"
        description={error.message?.includes("Supabase não configurado") ? error.message : "Tente novamente. Se persistir, recarregue a página."}
        action={<Button variant="dark" icon="refresh" onClick={reset}>Tentar de novo</Button>}
      />
    </main>
  );
}
