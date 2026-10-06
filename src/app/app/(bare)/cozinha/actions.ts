"use server";
import { run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { ORDER_SELECT, sortItems } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithItems } from "@/lib/types";

export async function getKitchenOrdersAction() {
  return run(async () => {
    const ctx = await requireAction("kitchen.view");
    const supabase = await createClient();
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select(`${ORDER_SELECT}, table:dining_tables(label)`)
      .eq("organization_id", ctx.org.id)
      .or(`status.in.(confirmed,preparing),and(status.eq.ready,ready_at.gte.${since})`)
      .order("confirmed_at", { ascending: true })
      .limit(80);
    if (error) throw error;
    return ((data ?? []) as (OrderWithItems & { table: { label: string } | null })[]).map((o) => ({ ...sortItems(o), table_label: o.table?.label ?? null }));
  });
}
