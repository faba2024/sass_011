import { localDateISO } from "@/lib/format";

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resolvePeriod(sp: { de?: string; ate?: string }, tz: string) {
  const today = localDateISO(new Date(), tz);
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const to = valid(sp.ate) ?? today;
  const from = valid(sp.de) ?? shift(to, -29);
  return from <= to ? { from, to } : { from: to, to: from };
}
