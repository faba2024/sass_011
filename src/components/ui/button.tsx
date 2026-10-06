"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "success" | "outline";
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ember-500 text-white hover:bg-ember-600 active:bg-ember-700 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken active:bg-line",
  outline: "bg-transparent text-ink border border-line-strong hover:bg-surface",
  ghost: "bg-transparent text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-ketchup-500 text-white hover:bg-ketchup-700",
  dark: "bg-ink text-white hover:bg-char-700",
  success: "bg-pickle-500 text-white hover:bg-pickle-700",
};
const SIZES: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-sm",
  sm: "h-8 px-2.5 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
  xl: "h-14 px-6 text-base gap-2.5 rounded-lg font-semibold",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, loading, block, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  const iconSize = size === "xs" ? 14 : size === "xl" ? 20 : 16;
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, cn(block && "w-full", className))} {...rest}>
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size = "md", icon, iconRight, className, children, target, block }: { href: string; variant?: Variant; size?: Size; icon?: IconName; iconRight?: IconName; className?: string; children?: ReactNode; target?: string; block?: boolean }) {
  const iconSize = size === "xs" ? 14 : size === "xl" ? 20 : 16;
  const external = href.startsWith("http") || target === "_blank";
  const cls = buttonClass(variant, size, cn(block && "w-full", className));
  if (external) {
    return (
      <a href={href} target={target ?? "_blank"} rel="noopener noreferrer" className={cls}>
        {icon && <Icon name={icon} size={iconSize} />}
        {children}
        {iconRight && <Icon name={iconRight} size={iconSize} />}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </Link>
  );
}

export function IconButton({ icon, label, variant = "ghost", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: Variant; size?: Size }) {
  const s: Size = size;
  const dims = { xs: "h-7 w-7", sm: "h-8 w-8", md: "h-9 w-9", lg: "h-11 w-11", xl: "h-14 w-14" }[s];
  return (
    <button type="button" aria-label={label} title={label} className={cn(buttonClass(variant, size), dims, "px-0", className)} {...rest}>
      <Icon name={icon} size={size === "xs" ? 14 : size === "lg" || size === "xl" ? 20 : 17} />
    </button>
  );
}
