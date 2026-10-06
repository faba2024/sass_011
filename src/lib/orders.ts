import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderWithItems } from "./types";

export const ORDER_SELECT =
  "*, order_items(id, order_id, product_id, product_name, unit_price, base_price, quantity, total, notes, sort, order_item_modifiers(id, kind, group_name, group_kind, name, unit_price, quantity, sort))";

export function sortItems(o: OrderWithItems): OrderWithItems {
  return {
    ...o,
    order_items: [...(o.order_items ?? [])]
      .sort((a, b) => a.sort - b.sort)
      .map((i) => ({ ...i, order_item_modifiers: [...(i.order_item_modifiers ?? [])].sort((a, b) => a.sort - b.sort) })),
  };
}

export async function fetchActiveOrders(supabase: SupabaseClient, orgId: string) {
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("organization_id", orgId)
    .or(`status.in.(new,awaiting_confirmation,confirmed,preparing,ready,out_for_delivery),and(status.in.(delivered,cancelled),updated_at.gte.${since})`)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as OrderWithItems[]).map(sortItems);
}

export async function fetchOrder(supabase: SupabaseClient, orgId: string, id: string) {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortItems(data as OrderWithItems) : null;
}
