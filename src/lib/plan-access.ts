/**
 * Regra ÚNICA de acesso por plano (servidor e navegador usam esta mesma função).
 * Ordem: 1) teste grátis ativo libera tudo  2) depois, recursos do plano contratado.
 * O banco aplica a mesma regra em org_features/plan_limit (migration 0010).
 */
import type { Feature } from "./permissions";

export const ALL_FEATURES: readonly Feature[] = [
  "cardapio_online", "pedidos", "cozinha", "delivery", "clientes", "cupons",
  "estoque", "caixa", "financeiro", "fidelidade", "mesas", "relatorios", "marketing", "dominio_proprio",
];

export interface PlanAccess {
  /** teste grátis valendo agora (trial_active e trial_ends_at no futuro) */
  trialActive: boolean;
  trialEndsAt: string | null;
  /** dias restantes do teste, arredondado para cima (dia 1 = 15; último dia = 1) */
  trialDaysLeft: number;
  planCode: string;
  planName: string;
  /** recursos do plano contratado (sem considerar o teste) */
  planFeatures: string[];
  /** a loja já escolheu/contratou um plano */
  planChosen: boolean;
  /** teste acabou e nenhum plano foi escolhido → mostrar a tela de escolha */
  needsPlan: boolean;
  status: string;
}

/** O teste ainda vale neste instante? (confere a data também no navegador) */
export function isTrialOn(a: Pick<PlanAccess, "trialActive" | "trialEndsAt">, now = Date.now()): boolean {
  return Boolean(a.trialActive && a.trialEndsAt && new Date(a.trialEndsAt).getTime() > now);
}

/** hasFeature: considera primeiro o teste ativo, depois o plano contratado. */
export function hasFeature(a: PlanAccess | null | undefined, feature?: Feature | string | null, now = Date.now()): boolean {
  if (!feature) return true;
  if (!a) return false;
  if (isTrialOn(a, now)) return true;
  return a.planFeatures.includes(feature);
}

/** Lista efetiva de recursos liberados agora. */
export function effectiveFeatures(a: PlanAccess | null | undefined, now = Date.now()): Feature[] {
  if (!a) return [];
  return isTrialOn(a, now) ? [...ALL_FEATURES] : (a.planFeatures.filter((f) => (ALL_FEATURES as readonly string[]).includes(f)) as Feature[]);
}

export function daysLeft(endsAt: string | null, now = Date.now()): number {
  if (!endsAt) return 0;
  const ms = new Date(endsAt).getTime() - now;
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Aviso discreto para escolher um plano: a partir de 7 dias, com reforço em 3 e no último dia. */
export function trialReminder(days: number): { level: "info" | "warn" | "last"; text: string } | null {
  if (days <= 0 || days > 7) return null;
  if (days === 1) return { level: "last", text: "Último dia do teste grátis. Escolha um plano para continuar sem interrupção — seus dados ficam salvos." };
  if (days <= 3) return { level: "warn", text: `Faltam ${days} dias de teste grátis. Escolha seu plano para não perder o acesso aos recursos.` };
  return { level: "info", text: `Faltam ${days} dias de teste grátis. Que tal já escolher o plano ideal para sua hamburgueria?` };
}

export function trialLabel(days: number): string {
  return days === 1 ? "Teste grátis — último dia" : `Teste grátis — faltam ${days} dias`;
}

/** Converte a resposta da RPC org_plan_state. */
export function fromPlanState(j: Record<string, unknown> | null | undefined): PlanAccess | null {
  if (!j || j.has_subscription === false) return null;
  return {
    trialActive: Boolean(j.trial_active),
    trialEndsAt: (j.trial_ends_at as string | null) ?? null,
    trialDaysLeft: Number(j.trial_days_left ?? 0),
    planCode: String(j.plan_code ?? ""),
    planName: String(j.plan_name ?? ""),
    planFeatures: Array.isArray(j.plan_features) ? (j.plan_features as string[]) : [],
    planChosen: Boolean(j.plan_chosen),
    needsPlan: Boolean(j.needs_plan),
    status: String(j.status ?? ""),
  };
}
