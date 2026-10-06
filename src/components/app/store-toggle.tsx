"use client";
import { useEffect, useRef, useState } from "react";
import { setStoreModeAction } from "@/app/app/actions";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { nextOpenLabel } from "@/lib/hours";
import type { StoreMode, StoreStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

const MODES: { mode: StoreMode; label: string; hint: string }[] = [
  { mode: "auto", label: "Automático", hint: "Abre e fecha conforme os horários cadastrados" },
  { mode: "open", label: "Abrir agora", hint: "Aceitar pedidos mesmo fora do horário" },
  { mode: "closed", label: "Fechar agora", hint: "Pausa pedidos online até reabrir" },
];

export function StoreToggle({ initial }: { initial: StoreStatus | null }) {
  const { can, org } = useApp();
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setStatus(initial), [initial]);
  useEffect(() => {
    if (!open) return;
    const h = (e: globalThis.MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!status) return null;
  const allowed = can("settings.manage") || can("orders.manage");

  const apply = async (mode: StoreMode) => {
    setBusy(true);
    const res = await setStoreModeAction(mode, mode === "closed" ? message : undefined);
    setBusy(false);
    if (!res.ok || !res.data) return toast.error(res.error ?? "Não foi possível alterar");
    setStatus(res.data);
    setOpen(false);
    toast.success(res.data.is_open ? "Loja aberta para pedidos" : "Loja fechada para pedidos");
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        disabled={!allowed}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
          status.is_open ? "border-pickle-100 bg-pickle-50 text-pickle-700" : "border-line bg-sunken text-ink-2",
          allowed && "hover:border-line-strong",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", status.is_open ? "bg-pickle-500 shadow-[0_0_0_3px_rgb(44_138_85/0.18)]" : "bg-faint")} />
        <span className="hidden sm:inline">{status.is_open ? "Loja aberta" : "Loja fechada"}</span>
        <span className="sm:hidden">{status.is_open ? "Aberta" : "Fechada"}</span>
        {status.mode !== "auto" && <span className="rounded-sm bg-white/70 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">manual</span>}
        {allowed && <Icon name="chevron-down" size={13} className="opacity-60" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[300px] animate-pop-in rounded-lg border border-line bg-surface p-1.5 shadow-pop">
          {!status.is_open && status.next_open_at && <p className="px-2.5 pb-1.5 pt-1 text-xs text-muted">{nextOpenLabel(status.next_open_at, org.timezone)}</p>}
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              disabled={busy}
              onClick={() => apply(m.mode)}
              className={cn("flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-sunken", status.mode === m.mode && "bg-sunken")}
            >
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", m.mode === "open" ? "bg-pickle-500" : m.mode === "closed" ? "bg-ketchup-500" : "bg-blueberry-500")} />
              <span>
                <span className="block text-[13px] font-medium">{m.label}</span>
                <span className="block text-xs text-muted">{m.hint}</span>
              </span>
              {status.mode === m.mode && <Icon name="check" size={15} className="ml-auto mt-0.5 text-ember-500" />}
            </button>
          ))}
          <div className="mt-1 border-t border-line p-2">
            <label className="text-[11px] font-medium text-muted" htmlFor="closed-msg">Mensagem quando fechada</label>
            <input
              id="closed-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hoje estamos fechados."
              className="mt-1 h-8 w-full rounded-md border border-line-strong px-2 text-[13px] focus:border-ember-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
