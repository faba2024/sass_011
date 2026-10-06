"use client";
import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/types";

/** Executa uma Server Action com estado de carregamento, toast e atualização da tela. */
export function useAction() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean; onSuccess?: (data: T | undefined) => void; onError?: (msg: string) => void } = {}) =>
      new Promise<ActionResult<T>>((resolve) => {
        start(async () => {
          let res: ActionResult<T>;
          try {
            res = await fn();
          } catch {
            res = { ok: false, error: "Falha de conexão. Verifique a internet e tente novamente." };
          }
          if (res.ok) {
            if (opts.success) toast.success(opts.success);
            opts.onSuccess?.(res.data);
            if (opts.refresh !== false) router.refresh();
          } else {
            toast.error(res.error ?? "Não foi possível concluir");
            opts.onError?.(res.error ?? "");
          }
          resolve(res);
        });
      }),
    [router, toast],
  );

  return { pending, run };
}
