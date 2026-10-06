"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cn("scroll-x flex gap-1 border-b border-line", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors",
            value === it.value ? "border-ember-500 text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {it.label}
          {it.count != null && <span className={cn("num rounded-sm px-1 text-[11px]", value === it.value ? "bg-ember-50 text-ember-700" : "bg-sunken text-muted")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function LinkTabs({ active, items, className }: { active: string; items: { href: string; value: string; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("scroll-x flex gap-1 border-b border-line", className)}>
      {items.map((it) => (
        <Link
          key={it.value}
          href={it.href}
          className={cn(
            "-mb-px flex h-9 shrink-0 items-center border-b-2 px-3 text-[13px] font-medium transition-colors",
            active === it.value ? "border-ember-500 text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, size = "md", className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; size?: "sm" | "md"; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-sunken p-0.5", className)} role="radiogroup">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-[5px] font-medium transition-all",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === it.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
