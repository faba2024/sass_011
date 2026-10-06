"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Field, Textarea } from "./field";
import { Modal } from "./modal";

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** Pede um texto obrigatório (ex.: motivo do cancelamento). Resolve com o texto. */
  reason?: { label: string; placeholder?: string; minLength?: number; suggestions?: string[] };
}
type Resolver = (v: string | boolean) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<string | boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setText("");
    return new Promise<string | boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: string | boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const min = opts?.reason?.minLength ?? 3;
  const invalid = Boolean(opts?.reason) && text.trim().length < min;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(opts)}
        onClose={() => close(false)}
        title={opts?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {opts?.cancelLabel ?? "Voltar"}
            </Button>
            <Button
              variant={opts?.tone === "danger" ? "danger" : "primary"}
              disabled={invalid}
              onClick={() => close(opts?.reason ? text.trim() : true)}
              data-autofocus={!opts?.reason || undefined}
            >
              {opts?.confirmLabel ?? "Confirmar"}
            </Button>
          </>
        }
      >
        {opts?.description && <div className="text-sm leading-relaxed text-ink-2">{opts.description}</div>}
        {opts?.reason && (
          <Field label={opts.reason.label} required className="mt-3">
            <Textarea value={text} placeholder={opts.reason.placeholder} onChange={(e) => setText(e.target.value)} rows={3} />
            {opts.reason.suggestions && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {opts.reason.suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setText(s)} className="rounded-sm border border-line px-2 py-1 text-xs text-ink-2 hover:border-line-strong hover:bg-sunken">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm fora do ConfirmProvider");
  return ctx;
}
