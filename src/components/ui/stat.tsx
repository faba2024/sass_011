import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";

export function Stat({ label, value, previous, current, hint, invert, className }: { label: string; value: ReactNode; previous?: number; current?: number; hint?: ReactNode; invert?: boolean; className?: string }) {
  let delta: number | null = null;
  if (previous != null && current != null) delta = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
  const good = delta != null && (invert ? delta < 0 : delta > 0);
  return (
    <div className={cn("min-w-0 px-4 py-3.5 sm:px-5 sm:py-4", className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-1 truncate font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[26px]">{value}</div>
      <div className="mt-1.5 flex h-4 items-center gap-1.5 text-xs">
        {delta != null && Math.abs(delta) >= 0.5 ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-pickle-500" : "text-ketchup-500")}>
            <Icon name={delta > 0 ? "trending-up" : "trending-down"} size={13} />
            <span className="num">{Math.abs(delta).toFixed(0)}%</span>
          </span>
        ) : delta != null ? (
          <span className="text-muted">estável</span>
        ) : null}
        {hint && <span className="truncate text-muted">{hint}</span>}
      </div>
    </div>
  );
}

/** Faixa de indicadores (sem "cards coloridos"): divisórias finas de 1px */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card lg:grid-cols-4 [&>*]:bg-surface", className)}>{children}</div>;
}
