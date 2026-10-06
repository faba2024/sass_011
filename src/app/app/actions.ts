"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { ORG_COOKIE, getAuthContext, getUser, requireAction } from "@/lib/auth";
import { onlyDigits } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { StoreMode, StoreStatus } from "@/lib/types";

export async function switchOrgAction(orgId: string) {
  return run(async () => {
    const user = await getUser();
    if (!user) fail("Sessão expirada");
    const supabase = await createClient();
    const { data } = await supabase.rpc("is_org_member", { p_org: orgId });
    if (!data) fail("Você não tem acesso a esta empresa");
    const store = await cookies();
    store.set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
    return true;
  });
}

export interface SearchResult {
  type: "order" | "customer" | "product";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearchAction(query: string) {
  return run(async (): Promise<SearchResult[]> => {
    const ctx = await getAuthContext();
    if (!ctx) fail("Sessão expirada");
    const q = query.trim().slice(0, 60);
    if (q.length < 2) return [];
    const supabase = await createClient();
    const like = `%${q.replace(/[%_,()]/g, " ")}%`;
    const digits = onlyDigits(q);
    const results: SearchResult[] = [];
    const tasks: PromiseLike<unknown>[] = [];

    if (ctx.permissions.has("orders.view")) {
      let ordersQuery = supabase.from("orders").select("id, number, customer_name, total, status, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(6);
      ordersQuery = /^#?\d{1,7}$/.test(q) ? ordersQuery.eq("number", Number(q.replace("#", ""))) : ordersQuery.ilike("customer_name", like);
      tasks.push(
        ordersQuery.then(({ data }) => {
          for (const o of data ?? []) results.push({ type: "order", id: o.id, title: `Pedido #${o.number}`, subtitle: `${o.customer_name ?? "Cliente"} · R$ ${Number(o.total).toFixed(2).replace(".", ",")}`, href: `/app/pedidos/${o.id}` });
        }),
      );
    }
    if (ctx.permissions.has("customers.view")) {
      const filter = digits.length >= 4 ? `name.ilike.${like},phone.ilike.%${digits}%` : `name.ilike.${like}`;
      tasks.push(
        supabase.from("customers").select("id, name, phone, orders_count").eq("organization_id", ctx.org.id).is("deleted_at", null).or(filter).limit(6).then(({ data }) => {
          for (const c of data ?? []) results.push({ type: "customer", id: c.id, title: c.name, subtitle: `${c.phone ?? "sem telefone"} · ${c.orders_count} pedidos`, href: `/app/clientes/${c.id}` });
        }),
      );
    }
    if (ctx.permissions.has("menu.view")) {
      tasks.push(
        supabase.from("products").select("id, name, price, is_available").eq("organization_id", ctx.org.id).is("deleted_at", null).ilike("name", like).limit(6).then(({ data }) => {
          for (const p of data ?? []) results.push({ type: "product", id: p.id, title: p.name, subtitle: `R$ ${Number(p.price).toFixed(2).replace(".", ",")}${p.is_available ? "" : " · esgotado"}`, href: `/app/produtos?editar=${p.id}` });
        }),
      );
    }
    await Promise.all(tasks);
    return results;
  });
}

export async function markNotificationsReadAction(ids: string[]) {
  return run(async () => {
    const ctx = await getAuthContext();
    if (!ctx) fail("Sessão expirada");
    const parsed = z.array(z.string().uuid()).max(200).parse(ids);
    if (!parsed.length) return true;
    const supabase = await createClient();
    must(await supabase.from("notification_reads").upsert(parsed.map((id) => ({ notification_id: id, user_id: ctx.userId, organization_id: ctx.org.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true }));
    return true;
  });
}

export async function setStoreModeAction(mode: StoreMode, message?: string) {
  return run(async () => {
    const ctx = await requireAction(["settings.manage", "orders.manage"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_store_mode", { p_org: ctx.org.id, p_mode: mode, p_message: message ?? null });
    if (error) throw error;
    return data as StoreStatus;
  });
}
