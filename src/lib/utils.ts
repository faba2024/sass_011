export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Texto legível sobre uma cor de fundo (contraste WCAG simplificado) */
export function readableOn(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#17120E" : "#FFFFFF";
}

/** Mistura uma cor com branco/preto (0..1) para gerar tons */
export function shade(hex: string, amount: number) {
  const h = hex.replace("#", "");
  const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const target = amount >= 0 ? 255 : 0;
  const a = Math.abs(amount);
  return `#${n.map((c) => Math.round(c + (target - c) * a).toString(16).padStart(2, "0")).join("")}`;
}

export function groupBy<T, K extends string | number>(list: T[], key: (t: T) => K): Record<K, T[]> {
  return list.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function sum(list: number[]) {
  return list.reduce((a, b) => a + b, 0);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
