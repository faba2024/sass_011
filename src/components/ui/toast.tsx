"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn, uid } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { Portal } from "./portal";

type Kind = "success" | "error" | "info" | "order";
interface ToastItem {
  id: string;
  kind: Kind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}
interface ToastApi {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  info(title: string, description?: string): void;
  show(t: Omit<ToastItem, "id" | "duration"> & { duration?: number }): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<Kind, IconName> = { success: "check-circle", error: "alert", info: "info", order: "bell" };
const COLORS: Record<Kind, string> = {
  success: "text-pickle-500",
  error: "text-ketchup-500",
  info: "text-blueberry-500",
  order: "text-ember-500",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (t: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => {
      const id = uid();
      const duration = t.duration ?? (t.kind === "error" ? 6000 : 3500);
      setItems((l) => [...l.slice(-3), { ...t, id, duration }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ kind: "success", title, description }),
      error: (title, description) => show({ kind: "error", title, description }),
      info: (title, description) => show({ kind: "info", title, description }),
    }),
    [show],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal>
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:items-end" aria-live="polite">
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-pop",
                t.kind === "order" && "border-ember-200 bg-ember-50",
              )}
            >
              <Icon name={ICONS[t.kind]} size={18} className={cn("mt-0.5 shrink-0", COLORS[t.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    className="mt-1.5 text-[13px] font-semibold text-ember-600 hover:underline"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" aria-label="Fechar aviso" className="text-faint hover:text-ink" onClick={() => dismiss(t.id)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx;
}
