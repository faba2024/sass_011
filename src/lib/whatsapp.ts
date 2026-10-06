// WhatsApp complementar (sem API paga): templates com variáveis + link wa.me

export const TEMPLATE_VARS = ["cliente", "numero", "total", "link", "previsao", "pagamento", "loja", "endereco"] as const;

export function renderTemplate(body: string, vars: Partial<Record<(typeof TEMPLATE_VARS)[number], string>>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars as Record<string, string | undefined>)[k] ?? "");
}

export function waNumber(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export function waLink(phone: string | null | undefined, text?: string) {
  const n = waNumber(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return n ? `https://wa.me/${n}${q}` : `https://wa.me/${q}`;
}
