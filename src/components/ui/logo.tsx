import { cn } from "@/lib/utils";

/** Marca TOP BURGER OS: três camadas (pão, blend, pão) em uma comanda */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1A1511" />
      <path d="M7.5 14.2c0-4.3 3.8-7.2 8.5-7.2s8.5 2.9 8.5 7.2c0 .5-.4.8-.8.8H8.3a.8.8 0 0 1-.8-.8z" fill="#E2481E" />
      <rect x="6.5" y="16.6" width="19" height="3.2" rx="1.6" fill="#F4BD3C" />
      <path d="M7.5 21.6h17v.6a3.3 3.3 0 0 1-3.3 3.3H10.8a3.3 3.3 0 0 1-3.3-3.3z" fill="#E2481E" />
      <circle cx="12.4" cy="10.6" r=".8" fill="#FFE3D7" />
      <circle cx="16.2" cy="9.6" r=".8" fill="#FFE3D7" />
      <circle cx="19.8" cy="11" r=".8" fill="#FFE3D7" />
    </svg>
  );
}

export function Logo({ className, dark, compact }: { className?: string; dark?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={compact ? 26 : 28} />
      <span className={cn("font-display text-[15px] font-bold leading-none tracking-[-0.02em]", dark ? "text-white" : "text-ink")}>
        TOP BURGER
        <span className={cn("ml-1 rounded-[3px] px-1 py-px align-[1px] font-mono text-[10px] font-semibold tracking-normal", dark ? "bg-white/15 text-white" : "bg-ink text-white")}>OS</span>
      </span>
    </span>
  );
}
