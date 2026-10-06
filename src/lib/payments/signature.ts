import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura do webhook (header x-signature: "ts=...,v1=...").
 * Manifesto: id:{data.id};request-id:{x-request-id};ts:{ts};
 */
export function verifyWebhookSignature(secret: string, signature: string | null, requestId: string | null, dataId: string | null) {
  if (!signature || !dataId) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
