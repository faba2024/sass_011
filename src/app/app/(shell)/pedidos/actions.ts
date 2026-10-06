"use server";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { fetchActiveOrders, fetchOrder } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, PaymentMethod } from "@/lib/types";

const uuid = z.string().uuid();

export async function getBoardAction() {
  return run(async () => {
    const ctx = await requireAction(["orders.view", "kitchen.view"]);
    const supabase = await createClient();
    return fetchActiveOrders(supabase, ctx.org.id);
  });
}

export async function getOrderDetailAction(id: string) {
  return run(async () => {
    const ctx = await requireAction(["orders.view", "kitchen.view"]);
    const supabase = await createClient();
    const order = await fetchOrder(supabase, ctx.org.id, uuid.parse(id));
    if (!order) fail("Pedido não encontrado");
    const [{ data: history }, { data: drivers }, { data: templates }, { data: table }, { data: customer }] = await Promise.all([
      supabase.from("order_status_history").select("id, from_status, to_status, note, created_at, changed_by").eq("order_id", order.id).order("created_at"),
      supabase.from("drivers").select("id, name, status, phone").eq("organization_id", ctx.org.id).eq("is_active", true).is("deleted_at", null).order("name"),
      supabase.from("whatsapp_templates").select("key, name, body").eq("organization_id", ctx.org.id).eq("is_active", true).order("name"),
      order.table_id ? supabase.from("dining_tables").select("label").eq("id", order.table_id).maybeSingle() : Promise.resolve({ data: null }),
      order.customer_id && ctx.permissions.has("customers.view")
        ? supabase.from("customers").select("id, orders_count, total_spent, tags").eq("id", order.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const ids = [...new Set((history ?? []).map((h: { changed_by: string | null }) => h.changed_by).filter(Boolean))] as string[];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
    const byId = new Map((people ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]));
    const historyWithPeople = (history ?? []).map((h: { changed_by: string | null }) => ({ ...h, profile: h.changed_by ? byId.get(h.changed_by) ?? null : null }));
    return {
      order,
      history: historyWithPeople as unknown as { id: string; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string; profile: { full_name: string | null; email: string | null } | null }[],
      drivers: (drivers ?? []) as { id: string; name: string; status: string; phone: string | null }[],
      templates: (templates ?? []) as { key: string; name: string; body: string }[],
      tableLabel: (table as { label: string } | null)?.label ?? null,
      customer: customer as { id: string; orders_count: number; total_spent: number; tags: string[] } | null,
    };
  });
}

export async function updateStatusAction(id: string, status: OrderStatus, note?: string, restock?: boolean | null) {
  return run(async () => {
    await requireAction(["orders.manage", "kitchen.view", "deliveries.own"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_order_status", { p_order: uuid.parse(id), p_status: status, p_note: note ?? null, p_restock: restock ?? null });
    if (error) throw error;
    return data as { id: string; status: OrderStatus };
  });
}

export async function assignDriverAction(id: string, driverId: string | null) {
  return run(async () => {
    await requireAction(["orders.manage", "delivery.manage"]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("assign_driver", { p_order: uuid.parse(id), p_driver: driverId ? uuid.parse(driverId) : null });
    if (error) throw error;
    return true;
  });
}

export async function markPaidAction(id: string, method?: PaymentMethod) {
  return run(async () => {
    await requireAction(["orders.manage", "cash.operate"]);
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_order_paid", { p_order: uuid.parse(id), p_method: method ?? null });
    if (error) throw error;
    return true;
  });
}

export async function updateOrderNotesAction(id: string, notes: string) {
  return run(async () => {
    const ctx = await requireAction("orders.manage");
    const supabase = await createClient();
    must(await supabase.from("orders").update({ notes: notes.trim().slice(0, 500) || null }).eq("id", uuid.parse(id)).eq("organization_id", ctx.org.id));
    return true;
  });
}

export async function logWhatsappAction(input: { orderId?: string | null; customerId?: string | null; templateKey?: string | null; phone: string; body: string }) {
  return run(async () => {
    const ctx = await requireAction(["orders.manage", "marketing.manage", "deliveries.own"]);
    const supabase = await createClient();
    must(
      await supabase.from("whatsapp_messages").insert({
        organization_id: ctx.org.id,
        order_id: input.orderId ?? null,
        customer_id: input.customerId ?? null,
        template_key: input.templateKey ?? null,
        phone: input.phone.replace(/\D/g, ""),
        body: input.body.slice(0, 2000),
      }),
    );
    return true;
  });
}

const filtersSchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

export async function exportOrdersAction(filters: z.infer<typeof filtersSchema>) {
  return run(async () => {
    const ctx = await requireAction("orders.view");
    const f = filtersSchema.parse(filters);
    const supabase = await createClient();
    let query = supabase
      .from("orders")
      .select("number, created_at, status, type, source, customer_name, customer_phone, subtotal, discount, delivery_fee, total, payment_method, payment_status, coupon_code, cancel_reason")
      .eq("organization_id", ctx.org.id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (f.status) query = query.eq("status", f.status);
    if (f.type) query = query.eq("type", f.type);
    if (f.from) query = query.gte("created_at", new Date(`${f.from}T00:00:00-03:00`).toISOString());
    if (f.to) query = query.lt("created_at", new Date(new Date(`${f.to}T00:00:00-03:00`).getTime() + 86400000).toISOString());
    if (f.q) query = /^\d+$/.test(f.q) ? query.eq("number", Number(f.q)) : query.ilike("customer_name", `%${f.q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  });
}
