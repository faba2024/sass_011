"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function openRegisterAction(amount: number, notes?: string) {
  return run(async () => {
    const ctx = await requireAction("cash.operate", "caixa");
    const supabase = await createClient();
    const { error } = await supabase.rpc("open_cash_register", { p_org: ctx.org.id, p_amount: z.coerce.number().min(0, "Valor inválido").parse(amount), p_notes: notes || null });
    if (error) throw error;
    revalidatePath("/app/caixa");
    return true;
  });
}

export async function cashMovementAction(type: "withdrawal" | "supply", amount: number, reason: string) {
  return run(async () => {
    const ctx = await requireAction("cash.operate", "caixa");
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_cash_movement", { p_org: ctx.org.id, p_type: z.enum(["withdrawal", "supply"]).parse(type), p_amount: z.coerce.number().positive("Informe um valor").parse(amount), p_reason: reason || null });
    if (error) throw error;
    revalidatePath("/app/caixa");
    return true;
  });
}

export async function closeRegisterAction(reported: number, notes?: string) {
  return run(async () => {
    const ctx = await requireAction("cash.operate", "caixa");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_cash_register", { p_org: ctx.org.id, p_reported: z.coerce.number().min(0).parse(reported), p_notes: notes || null });
    if (error) throw error;
    revalidatePath("/app/caixa");
    return data as Record<string, number>;
  });
}
