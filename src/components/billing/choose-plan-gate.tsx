import { Icon } from "@/components/ui/icons";
import { PlanPicker, type PlanOption } from "./plan-picker";

/** Mostrada no lugar do painel quando o teste acabou e nenhum plano foi escolhido. Nenhum dado é apagado. */
export function ChoosePlanGate({ plans, canChoose }: { plans: PlanOption[]; canChoose: boolean }) {
  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-lg bg-mustard-50 text-mustard-700"><Icon name="sparkle" size={22} /></span>
        <h1 className="mt-4 font-display text-2xl font-semibold">Seu teste grátis terminou</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          Escolha um plano para continuar usando o painel. Pedidos, produtos, clientes, estoque e configurações continuam salvos.
        </p>
      </div>
      <div className="mt-8">
        {canChoose ? (
          <PlanPicker plans={plans} canChoose afterChoose="/app/configuracoes?tab=assinatura" />
        ) : (
          <p className="rounded-lg border border-line bg-paper p-4 text-center text-sm text-muted">Peça ao responsável pela hamburgueria para escolher o plano em Configurações → Assinatura.</p>
        )}
      </div>
    </div>
  );
}
