// Pix "copia e cola" estático (BR Code / EMV-MPM) — padrão do Banco Central.
// Não confirma pagamento: serve para o cliente pagar; a loja confirma o recebimento.

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(v: string, max: number) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-@]/g, "")
    .toUpperCase()
    .slice(0, max)
    .trim();
}

export function normalizePixKey(key: string, type?: string | null) {
  const k = key.trim();
  if (type === "phone") {
    const d = k.replace(/\D/g, "");
    return d.startsWith("55") ? `+${d}` : `+55${d}`;
  }
  if (type === "cpf" || type === "cnpj") return k.replace(/\D/g, "");
  return k;
}

export function buildPixPayload(opts: { key: string; keyType?: string | null; name: string; city: string; amount?: number; txid?: string; description?: string }) {
  const gui = tlv("00", "br.gov.bcb.pix");
  const keyField = tlv("01", normalizePixKey(opts.key, opts.keyType));
  const desc = opts.description ? tlv("02", sanitize(opts.description, 40)) : "";
  const merchantAccount = tlv("26", gui + keyField + desc);
  const amount = opts.amount && opts.amount > 0 ? tlv("54", opts.amount.toFixed(2)) : "";
  const txid = tlv("62", tlv("05", (opts.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***"));
  const payload =
    tlv("00", "01") +
    merchantAccount +
    tlv("52", "0000") +
    tlv("53", "986") +
    amount +
    tlv("58", "BR") +
    tlv("59", sanitize(opts.name, 25) || "LOJA") +
    tlv("60", sanitize(opts.city, 15) || "BRASIL") +
    txid +
    "6304";
  return payload + crc16(payload);
}
