import "server-only";
export { verifyWebhookSignature } from "./signature";

/**
 * Integração Mercado Pago (Pix dinâmico).
 * Toda decisão de "pago" vem de uma consulta GET /v1/payments/{id} feita pelo servidor
 * com o token da loja — o conteúdo do webhook nunca é usado como prova de pagamento.
 */
const API = "https://api.mercadopago.com";

export interface MpPayment {
  id: number | string;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  transaction_amount: number;
  external_reference: string | null;
  date_of_expiration: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
}

export class MercadoPagoError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function call<T>(token: string, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !body) {
    const msg = res.status === 401 ? "Access Token do Mercado Pago inválido ou expirado" : body?.message ?? `Mercado Pago respondeu ${res.status}`;
    throw new MercadoPagoError(msg, res.status);
  }
  return body;
}

/** Data no formato exigido pelo MP: 2026-10-02T12:30:00.000-03:00 */
function mpDate(d: Date) {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().replace("Z", "-03:00");
}

export async function createPixPayment(token: string, input: {
  orderId: string; orderNumber: number; amount: number; attempt: number; storeName: string; customerName: string | null;
  payerEmail: string; notificationUrl: string | null; expiresInMinutes?: number; description?: string; externalReference?: string;
}) {
  const expires = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);
  const [first, ...rest] = (input.customerName ?? "Cliente").trim().split(/\s+/);
  return call<MpPayment>(token, "/v1/payments", {
    method: "POST",
    idempotencyKey: `pedido-${input.orderId}-${input.attempt}`,
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: (input.description ?? `${input.storeName} · Pedido #${input.orderNumber}`).slice(0, 120),
      payment_method_id: "pix",
      external_reference: input.externalReference ?? input.orderId,
      date_of_expiration: mpDate(expires),
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      payer: { email: input.payerEmail, first_name: first || "Cliente", last_name: rest.join(" ") || undefined },
    }),
  });
}

export function getPayment(token: string, id: string) {
  return call<MpPayment>(token, `/v1/payments/${encodeURIComponent(id)}`);
}

/** Valida o token chamando /users/me (usado no botão "Testar conexão") */
export async function checkToken(token: string) {
  const me = await call<{ id: number; nickname?: string; site_id?: string }>(token, "/users/me");
  return { id: String(me.id), nickname: me.nickname ?? null, site: me.site_id ?? null };
}

export function mapStatus(s: MpPayment["status"]): "pending" | "approved" | "rejected" | "cancelled" | "refunded" {
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  if (s === "refunded" || s === "charged_back") return "refunded";
  return "pending";
}
