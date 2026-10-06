// Junta as migrations (e opcionalmente o seed) em um único arquivo para colar no SQL Editor do Supabase.
// Uso: npm run db:bundle            → supabase/bundle/schema.sql
//      npm run db:bundle -- --seed  → também gera supabase/bundle/schema+seed.sql
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const header = (name) => `\n-- ${"=".repeat(68)}\n-- ${name}\n-- ${"=".repeat(68)}\n`;
const schema = files.map((f) => header(`migrations/${f}`) + readFileSync(path.join(dir, f), "utf8")).join("\n");
const out = path.join(root, "supabase", "bundle");
mkdirSync(out, { recursive: true });
const banner = `-- TOP BURGER OS — schema completo (${files.length} migrations). Gerado por scripts/bundle-sql.mjs\n-- Execute UMA vez em um projeto Supabase novo (SQL Editor → New query → Run).\n`;
writeFileSync(path.join(out, "schema.sql"), banner + schema);
console.log(`✓ supabase/bundle/schema.sql (${files.length} migrations)`);
if (process.argv.includes("--seed")) {
  const seed = readFileSync(path.join(root, "supabase", "seed.sql"), "utf8");
  writeFileSync(path.join(out, "schema+seed.sql"), banner + schema + header("seed.sql") + seed);
  console.log("✓ supabase/bundle/schema+seed.sql");
}
