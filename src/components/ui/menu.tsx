"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu de ações (⋯) com fechamento por clique fora/Esc */
export function Menu({ items, trigger, align = "right", label = "Mais ações" }: { items: (MenuItem | "divider")[]; trigger?: ReactNode; align?: "left" | "right"; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
      >
        {trigger ?? <Icon name="more" size={18} />}
      </button>
      {open && (
        <div role="menu" className={cn("absolute z-50 mt-1 min-w-[180px] animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={`d${i}`} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] disabled:opacity-40",
                  it.danger ? "text-ketchup-500 hover:bg-ketchup-50" : "text-ink hover:bg-sunken",
                )}
              >
                {it.icon && <Icon name={it.icon} size={15} />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
