"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorState
        title="Não foi possível carregar esta tela"
        description={error.message && !error.message.includes("digest") ? error.message : "Verifique sua conexão e tente novamente."}
        action={<Button variant="dark" icon="refresh" onClick={reset}>Tentar novamente</Button>}
      />
    </div>
  );
}
