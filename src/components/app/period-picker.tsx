"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/field";
import { localDateISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PeriodPicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { org } = useApp();
  const today = localDateISO(new Date(), org.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = shift(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 8)}01`;
  const presets = [
    { label: "Hoje", from: today, to: today },
    { label: "7 dias", from: shift(today, -6), to: today },
    { label: "30 dias", from: shift(today, -29), to: today },
    { label: "Este mês", from: monthStart, to: today },
    { label: "Mês passado", from: prevMonthStart, to: prevMonthEnd },
    { label: "90 dias", from: shift(today, -89), to: today },
  ];
  const go = (f: string, t: string) => {
    const u = new URLSearchParams(sp.toString());
    u.set("de", f);
    u.set("ate", t);
    router.push(`${pathname}?${u.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="scroll-x flex gap-1 rounded-md border border-line bg-sunken p-0.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => go(p.from, p.to)} className={cn("h-7 shrink-0 rounded-[5px] px-2.5 text-xs font-medium", p.from === from && p.to === to ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input type="date" aria-label="De" value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} className="h-8 w-[140px] text-xs" />
        <span className="text-xs text-muted">até</span>
        <Input type="date" aria-label="Até" value={to} min={from} onChange={(e) => e.target.value && go(from, e.target.value)} className="h-8 w-[140px] text-xs" />
      </div>
    </div>
  );
}
