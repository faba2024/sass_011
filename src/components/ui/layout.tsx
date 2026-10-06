import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">{eyebrow}</div>}
        <h1 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[24px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-card", padded && "p-4 sm:p-5", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, children, aside }: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-6 last:border-0 lg:grid-cols-[260px_1fr] lg:gap-10">
      <div>
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Tabela responsiva: rola na horizontal em telas pequenas */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("thin-scroll overflow-x-auto rounded-lg border border-line bg-surface shadow-card", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "center" }) {
  return (
    <th className={cn("sticky top-0 border-b border-line bg-paper px-3.5 py-2.5 text-xs font-medium text-muted first:pl-4 last:pr-4", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "center" }) {
  return <td className={cn("border-b border-line px-3.5 py-3 align-middle first:pl-4 last:pr-4 [tr:last-child_&]:border-0", align === "right" && "text-right", align === "center" && "text-center", className)}>{children}</td>;
}
