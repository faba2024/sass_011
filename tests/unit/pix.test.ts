import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPixPayload, crc16, normalizePixKey } from "../../src/lib/pix.ts";

/** Lê o BR Code em pares TLV */
function parse(payload: string) {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

test("CRC16-CCITT (FALSE) do vetor padrão", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("BR Code com valor, nome e cidade normalizados", () => {
  const p = buildPixPayload({ key: "(71) 99999-0000", keyType: "phone", name: "Levi Burguer Lanchonete Ltda ME", city: "Salvador", amount: 77.8, txid: "PED-1058" });
  const f = parse(p);
  assert.equal(f["00"], "01");
  assert.equal(f["53"], "986");
  assert.equal(f["54"], "77.80");
  assert.equal(f["58"], "BR");
  assert.ok(f["59"].length <= 25);
  assert.equal(f["60"], "SALVADOR");
  const mai = parse(f["26"]);
  assert.equal(mai["00"], "br.gov.bcb.pix");
  assert.equal(mai["01"], "+5571999990000");
  assert.equal(parse(f["62"])["05"], "PED1058");
  // CRC confere com o conteúdo
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test("chave CPF/CNPJ só com dígitos; e-mail intacto", () => {
  assert.equal(normalizePixKey("12.345.678/0001-90", "cnpj"), "12345678000190");
  assert.equal(normalizePixKey("contato@levi.com", "email"), "contato@levi.com");
});

test("acentos removidos do nome do recebedor", () => {
  const f = parse(buildPixPayload({ key: "x@y.com", name: "Hambúrguer São João", city: "Feira de Santana" }));
  assert.equal(f["59"], "HAMBURGUER SAO JOAO");
  assert.equal(f["60"], "FEIRA DE SANTAN");
  assert.equal(f["54"], undefined);
});
