"use client";
import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, disabled, label, size = "md", tone = "ember" }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; size?: "sm" | "md" | "lg"; tone?: "ember" | "pickle" }) {
  const dims = { sm: ["h-4 w-7", "h-3 w-3", "translate-x-3"], md: ["h-5 w-9", "h-4 w-4", "translate-x-4"], lg: ["h-7 w-12", "h-6 w-6", "translate-x-5"] }[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50",
        dims[0],
        checked ? (tone === "pickle" ? "bg-pickle-500" : "bg-ember-500") : "bg-line-strong",
      )}
    >
      <span className={cn("rounded-full bg-white shadow-sm transition-transform duration-200", dims[1], checked && dims[2])} />
    </button>
  );
}
