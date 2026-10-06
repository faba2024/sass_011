"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";
import { Portal, useEscape, useScrollLock } from "./portal";

/** Painel lateral (desktop) que vira bottom sheet no celular */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  mobile = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  mobile?: "bottom" | "full";
}) {
  useScrollLock(open);
  useEscape(open, onClose);
  if (!open) return null;
  const w = { sm: "md:w-[380px]", md: "md:w-[460px]", lg: "md:w-[620px]" }[width];
  return (
    <Portal>
      <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
        <div className="absolute inset-0 animate-fade-in bg-char-950/40" onClick={onClose} />
        <aside
          className={cn(
            "absolute flex flex-col bg-surface shadow-pop",
            mobile === "bottom" ? "inset-x-0 bottom-0 max-h-[92dvh] animate-slide-up rounded-t-2xl" : "inset-0 animate-slide-up",
            "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:animate-slide-in-right md:rounded-none",
            w,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong md:hidden" />
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              {title && <h2 className="font-display text-[17px] font-semibold leading-tight">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton icon="x" label="Fechar" size="sm" onClick={onClose} className="-mr-1.5" />
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="safe-bottom border-t border-line bg-surface px-5 py-3">{footer}</div>}
        </aside>
      </div>
    </Portal>
  );
}
