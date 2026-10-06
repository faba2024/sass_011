import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPixPayment, getPayment, MercadoPagoError } from "./mercadopago";

/**
 * Mensalidade do SaaS paga com Pix na conta Mercado Pago da PLATAFORMA.
 * A service_role é usada só aqui no servidor: ler o token da plataforma,
 * gravar a cobrança e dar baixa — sempre após consultar o pagamento no gateway.
 */
export async function platformSecrets() {
  const db = createAdminClient();
  const { data } = await db.from("platform_secrets").select("key, value");
  const map = new Map(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return { token: map.get("mercadopago_access_token") ?? null, webhookSecret: map.get("mercadopago_webhook_secret") ?? null };
}

type Invoice = { id: string; organization_id: string; amount: number; status: string; provider_payment_id: string | null; qr_code: string | null; qr_code_base64: string | null; pix_expires_at: string | null };

export type InvoiceCharge = { paymentId: string; amount: number; qr_code: string | null; qr_code_base64: string | null; expires_at: string | null };

/** Cria (ou reaproveita) o Pix da fatura. A fatura precisa ser da organização informada. */
export async function chargeInvoice(orgId: string, paymentId: string, orgName: string): Promise<InvoiceCharge> {
  const { token } = await platformSecrets();
  if (!token) throw new MercadoPagoError("O pagamento online da mensalidade ainda não foi ativado pela plataforma. Fale com o suporte.", 503);
  const db = createAdminClient();
  const { data } = await db.from("subscription_payments").select("id, organization_id, amount, status, provider_payment_id, qr_code, qr_code_base64, pix_expires_at").eq("id", paymentId).maybeSingle();
  const inv = data as Invoice | null;
  if (!inv || inv.organization_id !== orgId) throw new MercadoPagoError("Fatura não encontrada", 404);
  if (inv.status === "paid") throw new MercadoPagoError("Esta fatura já está paga.", 409);
  if (inv.status === "cancelled") throw new MercadoPagoError("Fatura cancelada.", 409);

  if (inv.qr_code && inv.pix_expires_at && new Date(inv.pix_expires_at).getTime() > Date.now() + 60_000) {
    return { paymentId: inv.id, amount: Number(inv.amount), qr_code: inv.qr_code, qr_code_base64: inv.qr_code_base64, expires_at: inv.pix_expires_at };
  }
  let host = "example.com";
  try { const h = new URL(env.appUrl).hostname; if (h.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) host = h; } catch { /* padrão */ }
  const mp = await createPixPayment(token, {
    orderId: `sub-${inv.id}`, orderNumber: 0, amount: Number(inv.amount), attempt: Date.now(),
    storeName: "TOP BURGER OS", customerName: orgName, payerEmail: `assinatura-${inv.id.slice(0, 8)}@${host}`,
    notificationUrl: env.appUrl.startsWith("https://") ? `${env.appUrl}/api/webhooks/mercadopago?scope=platform` : null,
    expiresInMinutes: 60, description: `TOP BURGER OS · Mensalidade · ${orgName}`, externalReference: `sub:${inv.id}`,
  });
  const td = mp.point_of_interaction?.transaction_data ?? {};
  const { error } = await db.from("subscription_payments").update({
    provider: "mercadopago", provider_payment_id: String(mp.id), qr_code: td.qr_code ?? null, qr_code_base64: td.qr_code_base64 ?? null, pix_expires_at: mp.date_of_expiration,
  }).eq("id", inv.id);
  if (error) throw error;
  return { paymentId: inv.id, amount: Number(inv.amount), qr_code: td.qr_code ?? null, qr_code_base64: td.qr_code_base64 ?? null, expires_at: mp.date_of_expiration };
}

/** Consulta o Pix no gateway e dá baixa na fatura se aprovado */
export async function syncInvoiceByProviderId(providerPaymentId: string) {
  const { token } = await platformSecrets();
  if (!token) return { paid: false };
  const mp = await getPayment(token, providerPaymentId);
  const ref = mp.external_reference ?? "";
  if (!ref.startsWith("sub:")) return { paid: false };
  if (mp.status !== "approved") return { paid: false, status: mp.status };
  const db = createAdminClient();
  const { error } = await db.rpc("confirm_subscription_pix", { p_payment: ref.slice(4), p_provider_payment_id: String(mp.id), p_amount: mp.transaction_amount });
  if (error) throw error;
  return { paid: true };
}

/** Para a tela da loja: confere a fatura (só da própria organização) */
export async function checkInvoice(orgId: string, paymentId: string) {
  const db = createAdminClient();
  const { data } = await db.from("subscription_payments").select("organization_id, status, provider_payment_id").eq("id", paymentId).maybeSingle();
  const inv = data as { organization_id: string; status: string; provider_payment_id: string | null } | null;
  if (!inv || inv.organization_id !== orgId) throw new MercadoPagoError("Fatura não encontrada", 404);
  if (inv.status === "paid") return { paid: true };
  if (!inv.provider_payment_id) return { paid: false };
  return syncInvoiceByProviderId(inv.provider_payment_id);
}
