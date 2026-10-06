"use client";
import { useRouter } from "next/navigation";
import { choosePlanAction } from "@/app/app/(shell)/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { useAction } from "@/hooks/use-action";
import { money } from "@/lib/format";
import { FEATURE_LABELS, type Feature } from "@/lib/permissions";

export interface PlanOption { code: string; name: string; price: number; description: string | null; features: string[] }

/** Cartões de plano com botão de escolha. Usado na tela de escolha (fim do teste), em Assinatura e em /app/plano. */
export function PlanPicker({ plans, currentCode, chosen, trialActive, highlight, canChoose, afterChoose }: {
  plans: PlanOption[]; currentCode?: string; chosen?: boolean; trialActive?: boolean; highlight?: string; canChoose: boolean; afterChoose?: string;
}) {
  const { run, pending } = useAction();
  const router = useRouter();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {plans.map((p) => {
        const isCurrent = chosen && p.code === currentCode;
        const marked = highlight ? p.features.includes(highlight) : false;
        return (
          <Card key={p.code} className={marked ? "ring-2 ring-ember-500" : isCurrent ? "ring-2 ring-pickle-500" : ""}>
            <div className="flex items-center gap-2">
              <p className="font-display text-lg font-semibold">{p.name}</p>
              {isCurrent && <Badge tone="green" dot>Seu plano</Badge>}
            </div>
            <p className="num mt-1 text-2xl font-semibold">{money(p.price)}<span className="text-sm font-normal text-muted">/mês</span></p>
            {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
            <ul className="mt-3 space-y-1 text-[12px] text-muted">
              {p.features.map((f) => <li key={f}>✓ {FEATURE_LABELS[f as Feature] ?? f}</li>)}
            </ul>
            {highlight && <p className={`mt-3 text-xs font-medium ${marked ? "text-pickle-700" : "text-faint"}`}>{marked ? "✓ inclui este recurso" : "não inclui este recurso"}</p>}
            {canChoose && (
              <Button className="mt-4" block variant={isCurrent ? "secondary" : "dark"} disabled={isCurrent} loading={pending}
                onClick={() => run(() => choosePlanAction(p.code), {
                  success: trialActive ? `Plano ${p.name} escolhido. Seu teste grátis continua até o fim.` : `Plano ${p.name} escolhido.`,
                  onSuccess: () => { if (afterChoose) router.push(afterChoose); },
                })}>
                {isCurrent ? "Plano atual" : chosen ? `Mudar para ${p.name}` : `Escolher ${p.name}`}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
