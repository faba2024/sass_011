"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";
import { Portal, useEscape, useScrollLock } from "./portal";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
}) {
  useScrollLock(open);
  useEscape(open, onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea, select, [data-autofocus]");
      el?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 animate-fade-in bg-char-950/45 backdrop-blur-[2px]" onClick={closeOnBackdrop ? onClose : undefined} />
        <div
          ref={panel}
          className={cn(
            "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:rounded-xl",
            "animate-slide-up sm:animate-pop-in",
            width,
          )}
        >
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3.5 pt-4">
              <div className="min-w-0">
                {title && <h2 className="font-display text-[17px] font-semibold leading-tight">{title}</h2>}
                {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
              </div>
              <IconButton icon="x" label="Fechar" size="sm" onClick={onClose} className="-mr-1.5 -mt-0.5" />
            </div>
          )}
          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
