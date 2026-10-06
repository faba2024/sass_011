import { expect, test } from "@playwright/test";

const SLUG = "leviburguer";

test.describe("Pedido online — fluxo completo", () => {
  test("cliente monta o pedido, finaliza e acompanha", async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await expect(page.getByRole("heading", { name: /levi burguer/i })).toBeVisible();

    // Abre o Levi Especial e personaliza
    await page.getByRole("link", { name: /levi especial/i }).first().click();
    await expect(page.getByText(/escolha o ponto/i)).toBeVisible();
    await page.getByText("Mal passada").first().click();
    await page.getByRole("button", { name: /adicionar/i }).last().click();

    // Carrinho
    await page.getByRole("link", { name: /ver carrinho/i }).click();
    await expect(page.getByText(/levi especial/i)).toBeVisible();
    await page.getByRole("link", { name: /continuar pedido/i }).click();

    // Checkout: retirada + Pix (a loja do seed está em modo "aberta")
    await page.getByPlaceholder("Como podemos te chamar?").fill("Cliente Teste E2E");
    await page.getByPlaceholder("(71) 99999-0000").fill("71988887777");
    await page.getByRole("button", { name: /retirada/i }).first().click();
    await page.getByRole("button", { name: /^pix/i }).first().click();
    await page.getByRole("button", { name: /confirmar pedido/i }).click();

    await expect(page.getByText(/pedido recebido/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/#\d{4,}/)).toBeVisible();
  });

  test("cupom inválido é recusado pelo servidor", async ({ page }) => {
    await page.goto(`/${SLUG}/cardapio`);
    await page.getByRole("link", { name: /smash bacon/i }).first().click();
    await page.getByRole("button", { name: /adicionar/i }).last().click();
    await page.goto(`/${SLUG}/checkout`);
    // cupom é validado pela cotação no servidor enquanto o cliente digita
    await page.locator("label", { hasText: "Cupom" }).locator("input").fill("NAOEXISTE");
    await expect(page.getByText(/cupom inválido/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Painel", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "Defina E2E_EMAIL e E2E_PASSWORD");

  test("login e quadro de pedidos", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-mail/i).fill(process.env.E2E_EMAIL!);
    await page.getByLabel(/senha/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/app/);
    await page.goto("/app/pedidos");
    await expect(page.getByText(/novos|em preparo/i).first()).toBeVisible();
  });

  test("isolamento: rota de outra empresa não abre", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-mail/i).fill(process.env.E2E_EMAIL!);
    await page.getByLabel(/senha/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/app/);
    const res = await page.goto("/app/pedidos/00000000-0000-0000-0000-000000000000");
    expect(res?.status()).toBe(404);
  });
});
