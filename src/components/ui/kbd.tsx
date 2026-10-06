import type { ReactNode } from "react";
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line-strong bg-surface px-1 font-mono text-[11px] text-muted shadow-[0_1px_0_var(--color-line-strong)]">{children}</kbd>;
}
