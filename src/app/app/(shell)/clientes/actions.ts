"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, softDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zOptText, zText } from "@/lib/zod-helpers";

const schema = z.object({
  name: zText(1, 80, "Informe o nome"),
  phone: z.string().optional().nullable().transform((v) => (v ? v.replace(/\D/g, "") || null : null)).refine((v) => !v || (v.length >= 10 && v.length <= 13), "Telefone inválido (com DDD)"),
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")).transform((v) => v || null),
  birthday: z.string().optional().nullable().transform((v) => v || null),
  notes: zOptText(1000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20),
});

export async function saveCustomerAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => {
    const r = await saveRow("customers", "customers.manage", schema.parse(input), id ? zId.parse(id) : null, { feature: "clientes" });
    revalidatePath("/app/clientes");
    return r.id;
  });
}

export async function deleteCustomerAction(id: string) {
  return run(() => softDelete("customers", "customers.manage", zId.parse(id), "/app/clientes"));
}

const addrSchema = z.object({
  customer_id: zId,
  zip: z.string().optional().nullable().transform((v) => (v ? v.replace(/\D/g, "") : null)),
  street: zText(1, 120, "Informe a rua"),
  number: zText(1, 20, "Informe o número"),
  district: zText(1, 80, "Informe o bairro"),
  complement: zOptText(80),
  reference: zOptText(120),
  city: zOptText(80),
});

export async function addAddressAction(input: z.input<typeof addrSchema>) {
  return run(async () => {
    const d = addrSchema.parse(input);
    const ctx = await requireAction("customers.manage");
    const supabase = await createClient();
    const c = await supabase.from("customers").select("id").eq("id", d.customer_id).eq("organization_id", ctx.org.id).maybeSingle();
    if (!c.data) fail("Cliente não encontrado");
    must(await supabase.from("customer_addresses").insert({ ...d, organization_id: ctx.org.id }));
    revalidatePath(`/app/clientes/${d.customer_id}`);
    return true;
  });
}

export async function deleteAddressAction(id: string, customerId: string) {
  return run(async () => {
    const ctx = await requireAction("customers.manage");
    const supabase = await createClient();
    must(await supabase.from("customer_addresses").delete().eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath(`/app/clientes/${customerId}`);
    return true;
  });
}

export async function redeemRewardAction(customerId: string, rewardId: string) {
  return run(async () => {
    await requireAction("customers.manage", "fidelidade");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("redeem_loyalty_reward", { p_customer: zId.parse(customerId), p_reward: zId.parse(rewardId) });
    if (error) throw error;
    revalidatePath(`/app/clientes/${customerId}`);
    return data as { reward: string; balance: number };
  });
}

export async function adjustPointsAction(customerId: string, points: number, reason: string) {
  return run(async () => {
    await requireAction("loyalty.manage", "fidelidade");
    const supabase = await createClient();
    const { error } = await supabase.rpc("adjust_loyalty_points", { p_customer: zId.parse(customerId), p_points: z.coerce.number().int().refine((v) => v !== 0, "Informe os pontos").parse(points), p_reason: reason });
    if (error) throw error;
    revalidatePath(`/app/clientes/${customerId}`);
    return true;
  });
}
