"use server";
import { z } from "zod";
import { fail, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { onlyDigits } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";

const item = z.object({
  key: z.string().optional(),
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
  options: z.array(z.object({ modifier_id: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).max(40),
  combo: z.array(z.object({ combo_group_id: z.string().uuid(), product_id: z.string().uuid() })).max(20),
});

const payloadSchema = z.object({
  source: z.enum(["pdv", "admin"]),
  type: z.enum(["delivery", "pickup", "dine_in", "counter"]),
  items: z.array(item).min(1, "Adicione pelo menos um produto").max(60),
  customer: z.object({ name: z.string().max(80).optional(), phone: z.string().max(20).optional() }),
  address: z.object({ zip: z.string().optional(), street: z.string().optional(), number: z.string().optional(), district: z.string().optional(), complement: z.string().optional(), reference: z.string().optional() }).optional(),
  zone_id: z.string().uuid().optional().nullable(),
  table_id: z.string().uuid().optional().nullable(),
  coupon_code: z.string().max(30).optional(),
  payment_method: z.enum(["pix", "cash", "card"]),
  change_for: z.number().positive().optional().nullable(),
  manual_discount: z.number().min(0).max(100000).optional(),
  paid: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});
export type StaffOrderPayload = z.infer<typeof payloadSchema>;

export async function quoteStaffOrderAction(payload: Omit<StaffOrderPayload, "source">) {
  return run(async () => {
    const ctx = await requireAction("orders.create");
    if (!payload.items.length) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("quote_order", { p_slug: ctx.org.slug, p_payload: { ...payload, customer: { ...payload.customer, phone: onlyDigits(payload.customer.phone) || undefined } } });
    if (error) throw error;
    return data as Quote;
  });
}

export async function createStaffOrderAction(input: StaffOrderPayload) {
  return run(async () => {
    const ctx = await requireAction("orders.create");
    const payload = payloadSchema.parse(input);
    if (payload.source === "pdv" && !ctx.permissions.has("cash.operate")) fail("Sem permissão para vender no caixa");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_staff_order", {
      p_org: ctx.org.id,
      p_payload: { ...payload, customer: { name: payload.customer.name?.trim() || undefined, phone: onlyDigits(payload.customer.phone) || undefined } },
    });
    if (error) throw error;
    return data as { id: string; number: number; total: number };
  });
}

export async function lookupCustomerAction(phone: string) {
  return run(async () => {
    const ctx = await requireAction("orders.create");
    const digits = onlyDigits(phone);
    if (digits.length < 10) return null;
    if (!ctx.permissions.has("customers.view")) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, orders_count, customer_addresses(id, zip, street, number, district, complement, reference, last_used_at)")
      .eq("organization_id", ctx.org.id)
      .eq("phone", digits)
      .maybeSingle();
    return data as { id: string; name: string; phone: string; orders_count: number; customer_addresses: { id: string; zip: string | null; street: string; number: string; district: string; complement: string | null; reference: string | null; last_used_at: string }[] } | null;
  });
}
