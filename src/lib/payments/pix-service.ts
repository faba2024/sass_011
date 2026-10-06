import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPixPayment, getPayment, mapStatus, MercadoPagoError } from "./mercadopago";

/**
 * Serviço do Pix automático. Usa a service_role APENAS no servidor para:
 * ler a credencial da loja, registrar a cobrança e confirmar o pagamento
 * (sempre depois de consultar o pagamento na API do Mercado Pago).
 */
type Integration = { organization_id: string; access_token: string; webhook_secret: string | null; is_enabled: boolean };
type OrderRow = { id: string; organization_id: string; number: number; total: number; status: string; payment_method: string; payment_status: string; customer_name: string | null; organization: { name: string; slug: string } | null };

export async function loadIntegration(orgId: string): Promise<Integration | null> {
  const db = createAdminClient();
  const { data } = await db.from("payment_integrations").select("organization_id, access_token, webhook_secret, is_enabled").eq("organization_id", orgId).maybeSingle();
  return (data as Integration | null) ?? null;
}

async function loadOrderByToken(token: string): Promise<OrderRow | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("id, organization_id, number, total, status, payment_method, payment_status, customer_name, organization:organizations(name, slug)")
    .eq("public_token", token)
    .maybeSingle();
  return (data as unknown as OrderRow | null) ?? null;
}

function payerEmail(orderNumber: number) {
  let host = "";
  try { host = new URL(env.appUrl).hostname; } catch { host = ""; }
  const domain = host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : "example.com";
  return `pedido-${orderNumber}@${domain}`;
}

function notificationUrl(orgId: string) {
  // O Mercado Pago só aceita notificações em HTTPS público; em localhost a página consulta o status.
  return env.appUrl.startsWith("https://") ? `${env.appUrl}/api/webhooks/mercadopago?org=${orgId}` : null;
}

export type PixCharge = { status: string; qr_code: string | null; qr_code_base64: string | null; expires_at: string | null; amount: number };

/** Cria (ou reaproveita) a cobrança Pix do pedido */
export async function ensurePixCharge(token: string): Promise<{ online: false } | { online: true; paid: boolean; charge: PixCharge | null; error?: string }> {
  const order = await loadOrderByToken(token);
  if (!order) throw new MercadoPagoError("Pedido não encontrado", 404);
  const integ = await loadIntegration(order.organization_id);
  if (!integ?.is_enabled) return { online: false };
  if (order.payment_status === "paid") return { online: true, paid: true, charge: null };
  if (order.payment_method !== "pix" || order.status === "cancelled") return { online: true, paid: false, charge: null, error: "Este pedido não aceita Pix online" };

  const db = createAdminClient();
  const { data: existing } = await db
    .from("order_payments")
    .select("status, qr_code, qr_code_base64, expires_at, amount")
    .eq("order_id", order.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ex = existing as PixCharge | null;
  if (ex && Number(ex.amount) === Number(order.total) && (!ex.expires_at || new Date(ex.expires_at).getTime() > Date.now() + 60_000)) {
    return { online: true, paid: false, charge: ex };
  }
  if (ex) await db.from("order_payments").update({ status: "expired" }).eq("order_id", order.id).eq("status", "pending");
  const { count } = await db.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id);

  const mp = await createPixPayment(integ.access_token, {
    orderId: order.id, orderNumber: order.number, amount: Number(order.total),
    attempt: count ?? 0, storeName: order.organization?.name ?? "Pedido", customerName: order.customer_name,
    payerEmail: payerEmail(order.number), notificationUrl: notificationUrl(order.organization_id),
  });
  const td = mp.point_of_interaction?.transaction_data ?? {};
  const charge: PixCharge = { status: "pending", qr_code: td.qr_code ?? null, qr_code_base64: td.qr_code_base64 ?? null, expires_at: mp.date_of_expiration, amount: Number(order.total) };
  const { error } = await db.from("order_payments").upsert(
    { organization_id: order.organization_id, order_id: order.id, provider: "mercadopago", provider_payment_id: String(mp.id), amount: order.total, qr_code: charge.qr_code, qr_code_base64: charge.qr_code_base64, ticket_url: td.ticket_url ?? null, expires_at: charge.expires_at, status: "pending" },
    { onConflict: "provider,provider_payment_id" },
  );
  if (error) throw error;
  return { online: true, paid: false, charge };
}

/** Consulta o pagamento no Mercado Pago e, se aprovado, confirma o pedido */
export async function syncPayment(orgId: string, providerPaymentId: string) {
  const integ = await loadIntegration(orgId);
  if (!integ) return { ok: false as const, reason: "sem integração" };
  const mp = await getPayment(integ.access_token, providerPaymentId);
  const db = createAdminClient();
  const status = mapStatus(mp.status);
  const { data: row } = await db.from("order_payments").select("order_id, organization_id").eq("provider", "mercadopago").eq("provider_payment_id", String(mp.id)).maybeSingle();
  const orderId = (row as { order_id: string } | null)?.order_id ?? mp.external_reference;
  if (!orderId) return { ok: false as const, reason: "pagamento sem pedido" };
  // o pedido precisa ser da mesma loja dona do token
  const { data: order } = await db.from("orders").select("id, organization_id").eq("id", orderId).maybeSingle();
  if (!order || (order as { organization_id: string }).organization_id !== orgId) return { ok: false as const, reason: "pedido de outra loja" };

  if (status !== "approved") {
    await db.from("order_payments").update({ status }).eq("provider", "mercadopago").eq("provider_payment_id", String(mp.id)).neq("status", "approved");
    return { ok: true as const, status };
  }
  const { error } = await db.rpc("confirm_provider_payment", { p_order: orderId, p_provider: "mercadopago", p_provider_payment_id: String(mp.id), p_amount: mp.transaction_amount });
  if (error) throw error;
  return { ok: true as const, status };
}

/** Para a página do pedido: confere no gateway a cobrança pendente mais recente */
export async function refreshByToken(token: string) {
  const order = await loadOrderByToken(token);
  if (!order) throw new MercadoPagoError("Pedido não encontrado", 404);
  if (order.payment_status === "paid") return { paid: true };
  const db = createAdminClient();
  const { data } = await db.from("order_payments").select("provider_payment_id").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const pid = (data as { provider_payment_id: string } | null)?.provider_payment_id;
  if (!pid) return { paid: false };
  const r = await syncPayment(order.organization_id, pid);
  return { paid: r.ok && r.status === "approved", status: r.ok ? r.status : undefined };
}
