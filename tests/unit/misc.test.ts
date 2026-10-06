import { test } from "node:test";
import assert from "node:assert/strict";
import { toCSV } from "../../src/lib/csv.ts";
import { maskCep, maskPhone, money, slugify } from "../../src/lib/format.ts";
import { weeklyHours } from "../../src/lib/hours.ts";
import { renderTemplate, waLink, waNumber } from "../../src/lib/whatsapp.ts";

test("template de WhatsApp com variáveis", () => {
  assert.equal(renderTemplate("Oi {{cliente}}, pedido #{{ numero }} — {{total}}{{inexistente}}", { cliente: "Ana", numero: "1058", total: "R$ 77,80" }), "Oi Ana, pedido #1058 — R$ 77,80");
});

test("número wa.me com DDI 55", () => {
  assert.equal(waNumber("(71) 98888-1111"), "5571988881111");
  assert.equal(waNumber("5571988881111"), "5571988881111");
  assert.equal(waLink("71988881111", "olá & tchau"), "https://wa.me/5571988881111?text=ol%C3%A1%20%26%20tchau");
});

test("máscaras e slug", () => {
  assert.equal(maskPhone("71988881111"), "(71) 98888-1111");
  assert.equal(maskCep("40000000"), "40000-000");
  assert.equal(slugify("Levi Búrguer & Cia!"), "levi-burguer-cia");
  assert.match(money(77.8), /R\$\s?77,80/);
});

test("horário semanal agrupado com turno após meia-noite", () => {
  const w = weeklyHours([{ weekday: 5, opens_at: "18:00:00", closes_at: "02:00:00" }, { weekday: 5, opens_at: "11:00", closes_at: "14:30" }]);
  const fri = w.find((d) => d.weekday === 5)!;
  assert.equal(fri.closed, false);
  assert.match(fri.label, /18:00 – 02:00/);
  assert.equal(w.find((d) => d.weekday === 1)!.label, "Fechado");
});

test("CSV com aspas, ponto e vírgula e BOM", () => {
  const csv = toCSV([{ nome: 'Ana "VIP"', total: 10.5 }], [{ key: "nome", label: "Nome" }, { key: "total", label: "Total" }]);
  assert.ok(csv.includes('"Ana ""VIP"""'));
});
