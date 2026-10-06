"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { globalSearchAction, type SearchResult } from "@/app/app/actions";
import { Icon, type IconName } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { Portal, useEscape, useScrollLock } from "@/components/ui/portal";
import { Spinner } from "@/components/ui/spinner";
import { ALL_NAV_ITEMS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

const TYPE_ICON: Record<SearchResult["type"], IconName> = { order: "ticket", customer: "user", product: "burger" };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { can } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useScrollLock(open);
  useEscape(open, onClose);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setIndex(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) return setResults([]);
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await globalSearchAction(q);
      setResults(res.ok ? (res.data ?? []) : []);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const pages = useMemo(() => {
    const nq = norm(q);
    return ALL_NAV_ITEMS.filter((i) => can(i.perm)).filter((i) => !nq || norm(`${i.label} ${i.keywords ?? ""}`).includes(nq)).slice(0, nq ? 5 : 8);
  }, [q, can]);

  const all = [
    ...results.map((r) => ({ key: `${r.type}-${r.id}`, icon: TYPE_ICON[r.type], title: r.title, subtitle: r.subtitle, href: r.href })),
    ...pages.map((p) => ({ key: p.href, icon: p.icon, title: p.label, subtitle: "Ir para página", href: p.href })),
  ];

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Busca rápida">
        <div className="absolute inset-0 animate-fade-in bg-char-950/40" onClick={onClose} />
        <div className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Icon name="search" size={18} className="text-muted" />
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, all.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && all[index]) {
                  e.preventDefault();
                  go(all[index].href);
                }
              }}
              placeholder="Buscar pedido (#1058), cliente, telefone ou produto…"
              className="h-13 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-faint"
            />
            {loading ? <Spinner size={16} className="text-muted" /> : <Kbd>Esc</Kbd>}
          </div>
          <ul className="thin-scroll max-h-[55vh] overflow-y-auto p-1.5">
            {all.length === 0 && !loading && <li className="px-3 py-8 text-center text-[13px] text-muted">{q.length >= 2 ? "Nenhum resultado" : "Digite para buscar"}</li>}
            {all.map((r, i) => (
              <li key={r.key}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", i === index ? "bg-sunken" : "")}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface text-ink-2">
                    <Icon name={r.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                  </span>
                  {i === index && <Icon name="arrow-right" size={14} className="text-muted" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Portal>
  );
}
