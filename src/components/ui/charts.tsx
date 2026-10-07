"use client";
import { useMemo, useState, type ReactNode } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type ValueFormat = "number" | "money" | "orders" | "times";

function formatValue(format: ValueFormat, value: number) {
  if (format === "money") return money(value);
  if (format === "orders") return `${value} pedidos`;
  if (format === "times") return `${value}×`;
  return String(value);
}

/** Colunas (HTML/CSS: nítido em qualquer densidade de tela) */
export function BarChart({
  data,
  height = 180,
  format = "number",
  highlightLast,
  color = "bg-ember-500",
  ghost,
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  format?: ValueFormat;
  highlightLast?: boolean;
  color?: string;
  /** série de referência desenhada atrás (ex.: média) */
  ghost?: number[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value), ...(ghost ?? [0]));
  const every = Math.ceil(data.length / 8);
  return (
    <div className="select-none">
      <div className="relative flex items-end gap-[3px] sm:gap-1" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const gh = ghost ? (ghost[i] / max) * 100 : 0;
          const active = hover === i || (hover === null && highlightLast && i === data.length - 1);
          return (
            <div key={i} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              {ghost && <div className="absolute inset-x-[15%] bottom-0 rounded-t-[2px] bg-line" style={{ height: `${gh}%` }} />}
              <div
                className={cn("relative w-full rounded-t-[3px] transition-[height,opacity] duration-500", color, active ? "opacity-100" : "opacity-[0.72]")}
                style={{ height: `${Math.max(h, d.value > 0 ? 1.5 : 0)}%` }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow-pop">
                  <span className="text-char-200">{d.hint ?? d.label}</span> <span className="num font-semibold">{formatValue(format, d.value)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] sm:gap-1">
        {data.map((d, i) => (
          <div key={i} className="num flex-1 truncate text-center text-[10px] text-muted">
            {i % every === 0 || i === data.length - 1 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Linha com área (SVG vetorial + rótulos em HTML) */
export function LineChart({ data, height = 200, format = "number" }: { data: { label: string; value: number; hint?: string }[]; height?: number; format?: ValueFormat }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = useMemo(
    () => data.map((d, i) => ({ x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100, y: 100 - (d.value / max) * 92 - 4 })),
    [data, max],
  );
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${path} L100,100 L0,100 Z`;
  const every = Math.ceil(data.length / 7);
  return (
    <div className="select-none">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${g * 100}%` }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="tb-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ember-500)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-ember-500)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#tb-area)" />
          <path d={path} fill="none" stroke="var(--color-ember-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </div>
        {hover !== null && pts[hover] && (
          <>
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-line-strong" style={{ left: `${pts[hover].x}%` }} />
            <div className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ember-500 shadow" style={{ left: `${pts[hover].x}%`, top: `${pts[hover].y}%` }} />
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow-pop"
              style={{ left: `${Math.min(88, Math.max(12, pts[hover].x))}%`, top: -6 }}
            >
              <span className="text-char-200">{data[hover].hint ?? data[hover].label}</span> <span className="num font-semibold">{formatValue(format, data[hover].value)}</span>
            </div>
          </>
        )}
      </div>
      <div className="mt-1.5 flex">
        {data.map((d, i) => (
          <div key={i} className="num flex-1 truncate text-center text-[10px] text-muted">
            {i % every === 0 || i === data.length - 1 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranking com barras proporcionais */
export function RankList({ items, format = "number", empty = "Sem dados no período" }: { items: { label: ReactNode; value: number; sub?: ReactNode }[]; format?: ValueFormat; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="num w-4 shrink-0 text-xs text-faint">{i + 1}</span>
              <span className="truncate text-ink">{it.label}</span>
            </span>
            <span className="num shrink-0 font-medium">
              {formatValue(format, it.value)}
              {it.sub && <span className="ml-1.5 font-normal text-muted">{it.sub}</span>}
            </span>
          </div>
          <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-ember-500/80" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Barra 100% empilhada (participação) */
export function SplitBar({ parts, format = "number" }: { parts: { label: string; value: number; color: string }[]; format?: ValueFormat }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken">
        {parts.map((p) => (
          <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${formatValue(format, p.value)}`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className={cn("h-2 w-2 rounded-full", p.color)} />
              {p.label}
            </span>
            <span className="num text-muted">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
