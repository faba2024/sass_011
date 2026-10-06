import type { OrderItemRow } from "@/lib/types";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mod = OrderItemRow["order_item_modifiers"][number];

export function modLabel(m: Mod) {
  if (m.kind === "combo_choice") return m.name;
  if (m.group_kind === "removal") return m.name.toLowerCase().startsWith("sem") ? m.name : `Sem ${m.name}`;
  if (m.group_kind === "addon") return `+ ${m.name}${m.quantity > 1 ? ` (${m.quantity}x)` : ""}`;
  return m.name;
}

export function itemsSummary(items: OrderItemRow[], max = 3) {
  const parts = items.map((i) => `${i.quantity}x ${i.product_name}`);
  return parts.length > max ? `${parts.slice(0, max).join(", ")} +${parts.length - max}` : parts.join(", ");
}

/** Lista de itens com personalizações (painel / detalhe / impressão) */
export function OrderItems({ items, prices = true, dense }: { items: OrderItemRow[]; prices?: boolean; dense?: boolean }) {
  return (
    <ul className={cn("divide-y divide-dashed divide-line", dense && "text-[13px]")}>
      {items.map((it) => (
        <li key={it.id} className={dense ? "py-1.5" : "py-2.5"}>
          <div className="flex items-baseline gap-2">
            <span className="num shrink-0 font-mono font-semibold">{it.quantity}x</span>
            <span className="min-w-0 flex-1 font-medium">{it.product_name}</span>
            {prices && <span className="num shrink-0 text-ink-2">{money(it.total)}</span>}
          </div>
          {it.order_item_modifiers.length > 0 && (
            <ul className="ml-7 mt-0.5 space-y-0.5 text-[13px] text-ink-2">
              {it.order_item_modifiers.map((m) => (
                <li key={m.id} className={cn(m.group_kind === "removal" && "font-medium text-ketchup-700", m.group_kind === "addon" && "text-ember-700")}>
                  {m.kind === "combo_choice" ? "• " : ""}
                  {modLabel(m)}
                  {prices && Number(m.unit_price) > 0 && <span className="num ml-1 text-xs text-muted">{money(Number(m.unit_price) * m.quantity)}</span>}
                </li>
              ))}
            </ul>
          )}
          {it.notes && <p className="ml-7 mt-1 rounded-sm bg-mustard-50 px-1.5 py-0.5 text-[13px] text-mustard-700">Obs.: {it.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
