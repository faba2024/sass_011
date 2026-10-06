import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSupabaseUrl, cleanKey } from "../../src/lib/env.ts";

const BASE = "https://wdktoipuwrqzezmhgwft.supabase.co";

test("URL do Supabase vira só a origem (sem /rest/v1, /auth/v1, barra, espaços ou aspas)", () => {
  for (const v of [
    BASE, `${BASE}/`, `${BASE}/rest/v1/`, `${BASE}/rest/v1`, `${BASE}/auth/v1`, `${BASE}/auth/v1/token`,
    `  ${BASE}/rest/v1/  `, `"${BASE}"`, `'${BASE}/'`, "wdktoipuwrqzezmhgwft.supabase.co", `${BASE}/rest/v1/?apikey=x`,
  ]) assert.equal(normalizeSupabaseUrl(v), BASE, v);
  assert.equal(normalizeSupabaseUrl(""), "");
  assert.equal(normalizeSupabaseUrl(undefined), "");
  assert.equal(normalizeSupabaseUrl("sb_secret_abc"), "");
  assert.equal(normalizeSupabaseUrl("sb_publishable_abc"), "");
  assert.equal(normalizeSupabaseUrl("http://127.0.0.1:54321/rest/v1"), "http://127.0.0.1:54321");
});

test("chave pública sem espaços ou aspas", () => {
  assert.equal(cleanKey(' "sb_publishable_abc" \n'), "sb_publishable_abc");
});
