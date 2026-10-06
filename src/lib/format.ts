// Formatação pt-BR (sem dependências)

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function money(v: number | string | null | undefined) {
  return brl.format(Number(v ?? 0)).replace(/ /g, " ");
}
/** "+ R$ 5,00" para acréscimos; vazio quando zero */
export function plusMoney(v: number) {
  return v > 0 ? `+ ${money(v)}` : "";
}
export function number(v: number | string | null | undefined) {
  return num.format(Number(v ?? 0));
}
export function integer(v: number | string | null | undefined) {
  return int.format(Number(v ?? 0));
}
export function percent(v: number | null | undefined, digits = 1) {
  return `${Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

export function phone(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return v ?? "";
}

/** Máscara de digitação de telefone */
export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
export function maskCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

const TZ = "America/Bahia";

export function dateTime(v: string | Date | null | undefined, tz = TZ) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function date(v: string | Date | null | undefined, tz = TZ) {
  if (!v) return "—";
  const isDateOnly = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = isDateOnly ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return d.toLocaleDateString("pt-BR", { timeZone: isDateOnly ? "UTC" : tz, day: "2-digit", month: "2-digit", year: "numeric" });
}
export function shortDate(v: string | Date, tz = "UTC") {
  const d = typeof v === "string" && v.length === 10 ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
}
export function time(v: string | Date | null | undefined, tz = TZ) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

/** Minutos desde uma data (para "tempo esperando") */
export function minutesSince(v: string | Date, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(v).getTime()) / 60000));
}
export function elapsed(v: string | Date, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(v).getTime()) / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${ss}`;
}
export function relative(v: string | Date | null | undefined) {
  if (!v) return "—";
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} anos`;
}

export function initials(name: string | null | undefined) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function addressLine(a: { street?: string | null; number?: string | null; district?: string | null; complement?: string | null } | null | undefined) {
  if (!a) return "";
  return [a.street && `${a.street}${a.number ? `, ${a.number}` : ""}`, a.complement, a.district].filter(Boolean).join(" · ");
}

/** Data local (YYYY-MM-DD) no fuso informado */
export function localDateISO(d = new Date(), tz = TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
