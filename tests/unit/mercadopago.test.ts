import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../../src/lib/payments/signature.ts";

const secret = "segredo-de-teste";
const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

test("assinatura válida do webhook do Mercado Pago", () => {
  const v1 = sign("id:123456;request-id:req-1;ts:1700000000;");
  assert.equal(verifyWebhookSignature(secret, `ts=1700000000,v1=${v1}`, "req-1", "123456"), true);
});

test("id alfanumérico é comparado em minúsculas", () => {
  const v1 = sign("id:abc123;request-id:r;ts:1;");
  assert.equal(verifyWebhookSignature(secret, `ts=1,v1=${v1}`, "r", "ABC123"), true);
});

test("assinatura adulterada, segredo errado ou cabeçalho ausente são recusados", () => {
  const v1 = sign("id:123456;request-id:req-1;ts:1700000000;");
  assert.equal(verifyWebhookSignature(secret, `ts=1700000000,v1=${v1}`, "req-1", "999999"), false);
  assert.equal(verifyWebhookSignature("outro-segredo", `ts=1700000000,v1=${v1}`, "req-1", "123456"), false);
  assert.equal(verifyWebhookSignature(secret, null, "req-1", "123456"), false);
  assert.equal(verifyWebhookSignature(secret, "ts=1700000000", "req-1", "123456"), false);
});
