import { PlanPicker, type PlanOption } from "@/components/billing/plan-picker";
import { LinkButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { hasFeature, requireOrg } from "@/lib/auth";
import { ALL_NAV_ITEMS, FEATURE_LABELS, FEATURE_PLAN, type Feature } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

const NAMES: Record<string, string> = FEATURE_LABELS;

export default async function PlanGatePage({ searchParams }: { searchParams: Promise<{ recurso?: string }> }) {
  const ctx = await requireOrg();
  const { recurso } = await searchParams;
  const feature = (recurso ?? "") as Feature;

  // Teste grátis ativo (ou plano que já inclui o recurso): nada de bloqueio
  if (feature && hasFeature(ctx, feature)) {
    const target = ALL_NAV_ITEMS.find((i) => i.feature === feature)?.href ?? "/app";
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-lg bg-pickle-50 text-pickle-700"><Icon name="check-circle" size={22} /></span>
        <h1 className="mt-4 font-display text-2xl font-semibold">{NAMES[feature] ?? "Recurso"} está liberado</h1>
        <p className="mt-2 text-sm text-muted">{ctx.plan?.trialActive ? "Durante o teste grátis todos os recursos estão disponíveis." : "Este recurso faz parte do seu plano."}</p>
        <LinkButton href={target} variant="dark" className="mt-6">Abrir {NAMES[feature] ?? "recurso"}</LinkButton>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: plans } = await supabase.from("plans").select("code, name, price, features, description").eq("is_active", true).order("sort");
  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-lg bg-mustard-50 text-mustard-700">
          <Icon name="lock" size={22} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold">{NAMES[feature] ?? "Recurso"} faz parte do plano {FEATURE_PLAN[feature] ?? "superior"}</h1>
        <p className="mt-2 text-sm text-muted">
          Sua empresa está no plano <b className="text-ink">{ctx.subscription?.plan_name ?? "—"}</b>. Mude de plano abaixo — seus dados continuam onde estão.
        </p>
      </div>
      <div className="mt-8">
        <PlanPicker plans={(plans ?? []) as PlanOption[]} currentCode={ctx.plan?.planCode} chosen={ctx.plan?.planChosen} highlight={feature || undefined}
          canChoose={ctx.permissions.has("billing.view")} afterChoose="/app/configuracoes?tab=assinatura" />
      </div>
      <div className="mt-6 text-center">
        <LinkButton href="/app" variant="secondary">Voltar ao painel</LinkButton>
      </div>
    </div>
  );
}
