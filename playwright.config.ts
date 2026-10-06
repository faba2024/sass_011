import { defineConfig, devices } from "@playwright/test";

// Testes ponta a ponta contra o app rodando com um Supabase de teste já com o seed da LEVI BURGUER.
// Pré-requisitos: .env.local configurado, `npm run build` e `npm run start` (ou deixe o webServer subir).
// Variáveis: E2E_BASE_URL (padrão http://localhost:3000), E2E_EMAIL e E2E_PASSWORD (dono da Levi Burguer).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "pt-BR", timezoneId: "America/Bahia" },
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
