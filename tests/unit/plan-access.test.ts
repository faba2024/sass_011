import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, effectiveFeatures, hasFeature, trialLabel, trialReminder, type PlanAccess } from "../../src/lib/plan-access.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);
const STARTER = ["cardapio_online", "pedidos", "cozinha", "delivery", "clientes", "cupons"];
const PRO = [...STARTER, "estoque", "caixa", "financeiro", "fidelidade", "mesas", "relatorios"];
const base = (over: Partial<PlanAccess>): PlanAccess => ({
  trialActive: false, trialEndsAt: null, trialDaysLeft: 0, planCode: "STARTER", planName: "Starter",
  planFeatures: STARTER, planChosen: false, needsPlan: false, status: "trialing", ...over,
});
const trialFrom = (startedDaysAgo: number) => new Date(NOW - startedDaysAgo * DAY + 15 * DAY).toISOString();

test("dia 1, dia 14 e dia 15 do teste: dias restantes", () => {
  assert.equal(daysLeft(trialFrom(0), NOW), 15);
  assert.equal(daysLeft(trialFrom(13), NOW), 2);
  assert.equal(daysLeft(trialFrom(14.5), NOW), 1);
  assert.equal(daysLeft(trialFrom(15.01), NOW), 0);
  assert.equal(trialLabel(12), "Teste grátis — faltam 12 dias");
});

test("teste ativo libera recurso Pro e Premium no plano Starter", () => {
  const a = base({ trialActive: true, trialEndsAt: trialFrom(2) });
  assert.equal(hasFeature(a, "mesas", NOW), true);
  assert.equal(hasFeature(a, "marketing", NOW), true);
  assert.equal(hasFeature(a, "dominio_proprio", NOW), true);
  assert.equal(effectiveFeatures(a, NOW).length, 14);
});

test("teste vencido: vale o plano contratado (mesmo se a flag ainda estiver true)", () => {
  const a = base({ trialActive: true, trialEndsAt: trialFrom(16) });
  assert.equal(hasFeature(a, "marketing", NOW), false);
  assert.equal(hasFeature(a, "pedidos", NOW), true);
  const pro = base({ planFeatures: PRO, planCode: "PRO", planChosen: true, status: "active" });
  assert.equal(hasFeature(pro, "estoque", NOW), true);
  assert.equal(hasFeature(pro, "marketing", NOW), false);
  assert.equal(hasFeature(null, "pedidos", NOW), false);
  assert.equal(hasFeature(null, undefined, NOW), true);
});

test("avisos discretos: 7, 3 e 1 dia", () => {
  assert.equal(trialReminder(8), null);
  assert.equal(trialReminder(7)?.level, "info");
  assert.equal(trialReminder(3)?.level, "warn");
  assert.equal(trialReminder(1)?.level, "last");
  assert.equal(trialReminder(0), null);
});
