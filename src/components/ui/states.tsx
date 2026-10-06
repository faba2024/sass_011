import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line rounded-lg border border-line bg-surface">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "package", title, description, action, className, compact }: { icon?: IconName; title: string; description?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface/60 text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-sunken text-muted">
        <Icon name={icon} size={20} />
      </div>
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Não foi possível carregar", description, action }: { title?: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-ketchup-100 bg-ketchup-50/50 px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-ketchup-100 text-ketchup-500">
        <Icon name="alert" size={20} />
      </div>
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, icon, className }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode; icon?: IconName; className?: string }) {
  const styles = {
    info: "border-blueberry-100 bg-blueberry-50 text-blueberry-700",
    warn: "border-mustard-100 bg-mustard-50 text-mustard-700",
    error: "border-ketchup-100 bg-ketchup-50 text-ketchup-700",
    success: "border-pickle-100 bg-pickle-50 text-pickle-700",
  }[tone];
  const ic: IconName = icon ?? (tone === "success" ? "check-circle" : tone === "info" ? "info" : "alert");
  return (
    <div className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-snug", styles, className)}>
      <Icon name={ic} size={16} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
