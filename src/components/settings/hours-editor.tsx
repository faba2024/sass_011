"use client";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS } from "@/lib/constants";

export interface Shift { weekday: number; opens_at: string; closes_at: string }

/** Editor semanal: vários turnos por dia; fechamento após meia-noite é aceito (ex.: 18:00–02:00) */
export function HoursEditor({ value, onChange }: { value: Shift[]; onChange: (v: Shift[]) => void }) {
  const days = [1, 2, 3, 4, 5, 6, 0];
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {days.map((wd) => {
        const shifts = value.filter((s) => s.weekday === wd);
        const open = shifts.length > 0;
        const others = value.filter((s) => s.weekday !== wd);
        return (
          <li key={wd} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
            <div className="flex w-36 items-center gap-2.5">
              <Switch size="sm" checked={open} label={`${WEEKDAYS[wd]} aberto`} onChange={(v) => onChange(v ? [...value, { weekday: wd, opens_at: "18:00", closes_at: "23:30" }] : others)} />
              <span className="text-[13px] font-medium">{WEEKDAYS[wd]}</span>
            </div>
            {!open ? (
              <span className="text-[13px] text-muted">Fechado</span>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {shifts.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1">
                    <input type="time" aria-label="Abre" value={s.opens_at} onChange={(e) => onChange([...others, ...shifts.map((x, j) => (j === i ? { ...x, opens_at: e.target.value } : x))])} className="num bg-transparent text-[13px] outline-none" />
                    <span className="text-xs text-muted">às</span>
                    <input type="time" aria-label="Fecha" value={s.closes_at} onChange={(e) => onChange([...others, ...shifts.map((x, j) => (j === i ? { ...x, closes_at: e.target.value } : x))])} className="num bg-transparent text-[13px] outline-none" />
                    {s.closes_at <= s.opens_at && <span className="text-[10px] text-mustard-700">+1 dia</span>}
                    {shifts.length > 1 && <IconButton icon="x" label="Remover turno" size="xs" onClick={() => onChange([...others, ...shifts.filter((_, j) => j !== i)])} />}
                  </div>
                ))}
                {shifts.length < 3 && <Button size="xs" variant="ghost" icon="plus" onClick={() => onChange([...value, { weekday: wd, opens_at: "11:00", closes_at: "14:30" }])}>Turno</Button>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
