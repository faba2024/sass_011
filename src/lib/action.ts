import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ActionError } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

/** Converte erros do Postgres/Supabase em mensagens para o usuário. */
export function friendlyError(e: unknown): string {
  if (e instanceof ActionError) return e.message;
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return first?.message ?? "Dados inválidos";
  }
  const err = e as { code?: string; message?: string; details?: string } | null;
  const msg = err?.message ?? "Erro inesperado";
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) return "Você não tem permissão para esta ação.";
  if (err?.code === "23505") return "Já existe um registro com esses dados.";
  if (err?.code === "23503") return "Este registro está em uso e não pode ser removido.";
  if (err?.code === "23514") return "Algum valor informado é inválido.";
  if (err?.code === "PGRST116") return "Registro não encontrado.";
  return msg;
}

/** Executa uma Server Action devolvendo { ok, data | error } sem vazar stack para o cliente. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (!(e instanceof ActionError) && !(e instanceof ZodError)) console.error("[action]", e);
    return { ok: false, error: friendlyError(e) };
  }
}

/** Lança o erro do Supabase, se houver, e devolve os dados. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export function fail(message: string): never {
  throw new ActionError(message);
}
