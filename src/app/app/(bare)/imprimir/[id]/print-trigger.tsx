"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PrintTrigger({ width, kitchen }: { width: number; kitchen: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  const go = (w: number, via: boolean) => router.replace(`?w=${w}${via ? "&via=cozinha" : ""}`);
  return (
    <div className="no-print mx-auto mb-4 flex max-w-md flex-wrap items-center justify-center gap-2 text-[13px]">
      {[80, 58].map((w) => (
        <button key={w} type="button" onClick={() => go(w, kitchen)} className={`h-8 rounded-md border px-3 ${w === width ? "border-ink bg-ink text-white" : "border-line bg-surface"}`}>{w} mm</button>
      ))}
      <button type="button" onClick={() => go(width, !kitchen)} className="h-8 rounded-md border border-line bg-surface px-3">{kitchen ? "Via do cliente" : "Via da cozinha"}</button>
      <button type="button" onClick={() => window.print()} className="h-8 rounded-md bg-ember-500 px-3 font-medium text-white">Imprimir</button>
      <button type="button" onClick={() => window.close()} className="h-8 rounded-md px-3 text-muted">Fechar</button>
    </div>
  );
}
