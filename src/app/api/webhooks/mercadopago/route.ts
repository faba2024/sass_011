import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments/mercadopago";
import { loadIntegration, syncPayment } from "@/lib/payments/pix-service";
import { platformSecrets, syncInvoiceByProviderId } from "@/lib/payments/saas-billing";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Notificações do Mercado Pago. O corpo serve só como "aviso": o servidor consulta
 * o pagamento na API com o token da loja antes de confirmar qualquer coisa.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } };
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body.type ?? "";
  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: true });

  // mensalidades do SaaS (conta Mercado Pago da plataforma)
  if (url.searchParams.get("scope") === "platform") {
    const { token, webhookSecret } = await platformSecrets();
    if (!token) return NextResponse.json({ ok: false }, { status: 404 });
    if (webhookSecret && !verifyWebhookSignature(webhookSecret, req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
      return NextResponse.json({ ok: false, error: "assinatura inválida" }, { status: 401 });
    }
    try {
      return NextResponse.json(await syncInvoiceByProviderId(dataId));
    } catch (e) {
      console.error("[webhook mercadopago/plataforma]", e);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  const orgId = url.searchParams.get("org") ?? "";
  if (!UUID.test(orgId)) return NextResponse.json({ ok: false }, { status: 400 });

  const integ = await loadIntegration(orgId);
  if (!integ) return NextResponse.json({ ok: false }, { status: 404 });
  if (integ.webhook_secret && !verifyWebhookSignature(integ.webhook_secret, req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
    return NextResponse.json({ ok: false, error: "assinatura inválida" }, { status: 401 });
  }
  try {
    const r = await syncPayment(orgId, dataId);
    return NextResponse.json(r);
  } catch (e) {
    console.error("[webhook mercadopago]", e);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
