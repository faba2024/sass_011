"use client";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";

export const inputBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow] duration-150 focus:border-ember-500 focus:outline-none focus:ring-3 focus:ring-ember-500/15 disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-ketchup-500";

export function Label({ children, htmlFor, required, hint }: { children: ReactNode; htmlFor?: string; required?: boolean; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
      <span>
        {children}
        {required && <span className="ml-0.5 text-ember-500">*</span>}
      </span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Field({ label, htmlFor, required, hint, error, help, children, className }: { label?: ReactNode; htmlFor?: string; required?: boolean; hint?: ReactNode; error?: string | null; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-ketchup-500">{error}</p> : help ? <p className="mt-1 text-xs text-muted">{help}</p> : null}
    </div>
  );
}

export function Input({ className, icon, suffix, leading, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: IconName; suffix?: ReactNode; leading?: string; invalid?: boolean }) {
  if (!icon && !suffix && !leading) {
    return <input aria-invalid={invalid || undefined} className={cn(inputBase, "h-9", className)} {...rest} />;
  }
  return (
    <div className="relative flex items-center">
      {icon && <Icon name={icon} size={16} className="pointer-events-none absolute left-2.5 text-muted" />}
      {leading && <span className="pointer-events-none absolute left-3 text-sm text-muted">{leading}</span>}
      <input aria-invalid={invalid || undefined} className={cn(inputBase, "h-9", icon && "pl-8", leading && "pl-9", suffix != null && "pr-12", className)} {...rest} />
      {suffix && <span className="absolute right-3 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "min-h-[84px] py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, "h-9 appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

/** Campo de dinheiro em reais. Valor exposto como número (ou null). */
export function MoneyInput({ value, onChange, className, placeholder = "0,00", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null; onChange: (v: number | null) => void }) {
  const display = value == null ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Input
      {...rest}
      inputMode="decimal"
      leading="R$"
      className={cn("num text-right", className)}
      placeholder={placeholder}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange(digits ? Number(digits) / 100 : null);
      }}
    />
  );
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", disabled && "cursor-not-allowed opacity-60", className)}>
      <span
        className={cn(
          "mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border transition-colors",
          checked ? "border-ember-500 bg-ember-500 text-white" : "border-line-strong bg-surface",
        )}
      >
        {checked && <Icon name="check" size={13} strokeWidth={2.5} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
