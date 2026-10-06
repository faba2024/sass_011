import { WEEKDAYS } from "./constants";

/** "Abre hoje às 18:00" / "Abre sexta às 18:00" */
export function nextOpenLabel(iso: string | null | undefined, tz = "America/Bahia") {
  if (!iso) return null;
  const d = new Date(iso);
  const fmtDay = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const today = fmtDay(new Date());
  const tomorrow = fmtDay(new Date(Date.now() + 86400000));
  const hh = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const day = fmtDay(d);
  if (day === today) return `Abre hoje às ${hh}`;
  if (day === tomorrow) return `Abre amanhã às ${hh}`;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d));
  return `Abre ${WEEKDAYS[wd].toLowerCase()} às ${hh}`;
}

/** Agrupa os horários por dia: [{ weekday, label: "18:00 – 23:30" }] */
export function weeklyHours(hours: { weekday: number; opens_at: string; closes_at: string }[]) {
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const shifts = hours.filter((h) => h.weekday === wd);
    return {
      weekday: wd,
      name: WEEKDAYS[wd],
      label: shifts.length ? shifts.map((s) => `${s.opens_at.slice(0, 5)} – ${s.closes_at.slice(0, 5)}`).join(", ") : "Fechado",
      closed: shifts.length === 0,
    };
  });
}

export function currentWeekday(tz = "America/Bahia") {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date()));
}

/**
 * Horários disponíveis para agendamento (a cada 15 min) nos próximos 2 dias,
 * respeitando os turnos semanais e as exceções. Validação final é feita no servidor.
 */
export function schedulingSlots(
  hours: { weekday: number; opens_at: string; closes_at: string }[],
  exceptions: { date: string; is_closed: boolean; opens_at: string | null; closes_at: string | null }[],
  tz = "America/Bahia",
  leadMinutes = 30,
) {
  const slots: { value: string; day: string; label: string }[] = [];
  const now = Date.now();
  const offsetOf = (date: Date) => {
    // diferença entre o relógio local da loja e UTC, em minutos
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return (asUTC - date.getTime()) / 60000;
  };
  for (let i = 0; i < 3; i++) {
    const base = new Date(now + i * 86400000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(base));
    const ex = exceptions.find((e) => e.date === ymd);
    const shifts = ex ? (ex.is_closed ? [] : [{ opens_at: ex.opens_at ?? "00:00", closes_at: ex.closes_at ?? "00:00" }]) : hours.filter((h) => h.weekday === wd);
    const offset = offsetOf(base);
    for (const s of shifts) {
      const [oh, om] = s.opens_at.split(":").map(Number);
      const [ch, cm] = s.closes_at.split(":").map(Number);
      const startLocal = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), oh, om);
      let endLocal = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), ch, cm);
      if (endLocal <= startLocal) endLocal += 86400000;
      for (let t = startLocal + 30 * 60000; t <= endLocal - 15 * 60000; t += 15 * 60000) {
        const real = t - offset * 60000;
        if (real < now + leadMinutes * 60000) continue;
        const d = new Date(real);
        const dayLabel = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toLocaleDateString("pt-BR", { timeZone: tz, weekday: "long" });
        slots.push({ value: d.toISOString(), day: dayLabel, label: d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }) });
      }
    }
  }
  return slots;
}
