import { NextResponse } from "next/server";
import { MercadoPagoError } from "@/lib/payments/mercadopago";
import { ensurePixCharge, refreshByToken } from "@/lib/payments/pix-service";

export const dynamic = "force-dynamic";
const TOKEN = /^[a-f0-9]{32}$/;

function fail(e: unknown) {
  const status = e instanceof MercadoPagoError && e.status === 404 ? 404 : 502;
  const message = e instanceof MercadoPagoError ? e.message : "Não foi possível falar com o Mercado Pago agora";
  if (!(e instanceof MercadoPagoError)) console.error("[pix]", e);
  return NextResponse.json({ error: message }, { status });
}

/** Gera (ou reaproveita) o QR Code Pix do pedido */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  try {
    return NextResponse.json(await ensurePixCharge(token));
  } catch (e) {
    return fail(e);
  }
}

/** Confere o pagamento no Mercado Pago (funciona mesmo sem webhook, ex.: localhost) */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  try {
    return NextResponse.json(await refreshByToken(token));
  } catch (e) {
    return fail(e);
  }
}
