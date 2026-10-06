"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { ActionError, getUser, ORG_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { zId } from "@/lib/zod-helpers";

async function requireAdmin() {
  const user = await getUser();
  if (!user?.isPlatformAdmin) throw new ActionError("Apenas a administração da plataforma.");
  return { user, supabase: await createClient() };
}

const SUB_STATUS = ["trialing", "active", "pending", "past_due", "cancelled"] as const;

// ---------- Empresas -------------------------------------------------
const newOrgSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Endereço inválido"),
  owner_name: z.string().trim().min(2, "Informe o nome do responsável").max(80),
  owner_email: z.string().trim().toLowerCase().email("E-mail inválido"),
  owner_password: z.string().min(8, "Senha com pelo menos 8 caracteres").or(z.literal("")),
  plan_code: z.string().min(2),
  status: z.enum(SUB_STATUS),
  trial_days: z.coerce.number().int().min(0).max(90),
});

/** Cria empresa + usuário dono (usa SERVICE ROLE somente no servidor para criar o login) */
export async function createCompanyAction(input: z.input<typeof newOrgSchema>) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const d = newOrgSchema.parse(input);
    const { data: free } = await supabase.rpc("slug_available", { p_slug: d.slug });
    if (!free) fail("Endereço já em uso ou reservado");

    // Usuário existente? (perfil é criado pelo trigger handle_new_user)
    const { data: existing } = await supabase.from("profiles").select("id").eq("email", d.owner_email).maybeSingle();
    let ownerId = existing?.id as string | undefined;
    if (!ownerId) {
      if (!d.owner_password) fail("Informe uma senha inicial para o novo usuário");
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.createUser({ email: d.owner_email, password: d.owner_password, email_confirm: true, user_metadata: { full_name: d.owner_name } });
      if (error || !data.user) fail(error?.message ?? "Não foi possível criar o usuário");
      ownerId = data.user.id;
    }
    const { data: orgId, error } = await supabase.rpc("provision_organization", { p_name: d.name, p_slug: d.slug, p_owner: ownerId, p_plan_code: d.plan_code, p_trial_days: d.trial_days, p_sub_status: d.status });
    if (error) throw error;
    revalidatePath("/master", "layout");
    return String(orgId);
  });
}

export async function setCompanyStatusAction(id: string, status: "active" | "suspended" | "cancelled") {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const res = await supabase.from("organizations").update({ status: z.enum(["active", "suspended", "cancelled"]).parse(status) }).eq("id", zId.parse(id)).select("id");
    must(res);
    if (status === "cancelled") await supabase.rpc("platform_update_subscription", await currentSubArgs(supabase, id, "cancelled"));
    revalidatePath("/master", "layout");
    return true;
  });
}

async function currentSubArgs(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, status: string) {
  const { data } = await supabase.from("subscriptions").select("price, plan:plans(code)").eq("organization_id", orgId).maybeSingle();
  return { p_org: orgId, p_plan_code: ((data as { plan?: { code?: string } } | null)?.plan?.code) ?? "STARTER", p_status: status, p_price: data?.price ?? null };
}

const subSchema = z.object({
  plan_code: z.string().min(2),
  status: z.enum(SUB_STATUS),
  price: z.coerce.number().min(0).nullable(),
  trial_ends_at: z.string().nullable(),
  period_end: z.string().nullable(),
  notes: z.string().max(500).nullable(),
});
export async function updateSubscriptionAction(orgId: string, input: z.input<typeof subSchema>) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const d = subSchema.parse(input);
    const { error } = await supabase.rpc("platform_update_subscription", {
      p_org: zId.parse(orgId), p_plan_code: d.plan_code, p_status: d.status, p_price: d.price,
      p_trial_ends_at: d.trial_ends_at ? new Date(`${d.trial_ends_at}T23:59:59`).toISOString() : null, p_period_end: d.period_end || null, p_notes: d.notes || null,
    });
    if (error) throw error;
    revalidatePath("/master", "layout");
    return true;
  });
}

export async function setCustomDomainAction(orgId: string, domain: string) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (host && !/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) fail("Domínio inválido (ex.: pedidos.minhaloja.com.br)");
    must(await supabase.from("organizations").update({ custom_domain: host || null }).eq("id", zId.parse(orgId)).select("id"));
    revalidatePath("/master", "layout");
    return true;
  });
}

/** Abre o painel da empresa (suporte) — o admin da plataforma tem acesso por is_org_member() */
export async function openCompanyPanelAction(orgId: string) {
  return run(async () => {
    await requireAdmin();
    (await cookies()).set(ORG_COOKIE, zId.parse(orgId), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
    return true;
  });
}

// ---------- Faturas -------------------------------------------------
export async function createInvoiceAction(orgId: string, due: string, amount: number | null) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Informe o vencimento");
    const { error } = await supabase.rpc("platform_create_invoice", { p_org: zId.parse(orgId), p_due: due, p_amount: amount });
    if (error) throw error;
    revalidatePath("/master", "layout");
    return true;
  });
}
export async function registerPaymentAction(paymentId: string, method: string) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.rpc("platform_register_payment", { p_payment: zId.parse(paymentId), p_method: z.enum(["pix", "boleto", "card", "transfer", "cash"]).parse(method) });
    if (error) throw error;
    revalidatePath("/master", "layout");
    return true;
  });
}
export async function cancelInvoiceAction(paymentId: string) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const res = await supabase.from("subscription_payments").update({ status: "cancelled" }).eq("id", zId.parse(paymentId)).neq("status", "paid").select("id");
    must(res);
    if (!res.data?.length) fail("Fatura paga não pode ser cancelada");
    revalidatePath("/master", "layout");
    return true;
  });
}
export async function refreshBillingAction() {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("platform_refresh_billing");
    if (error) throw error;
    revalidatePath("/master", "layout");
    return data as { overdue: number; trials_expired: number };
  });
}

// ---------- Planos ---------------------------------------------------
const FEATURES = ["cardapio_online", "pedidos", "cozinha", "delivery", "clientes", "cupons", "estoque", "caixa", "financeiro", "fidelidade", "mesas", "relatorios", "marketing", "dominio_proprio"] as const;
const planSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, "Código: letras maiúsculas, números e _"),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).nullable(),
  price: z.coerce.number().min(0),
  max_members: z.coerce.number().int().min(1).nullable(),
  max_products: z.coerce.number().int().min(1).nullable(),
  max_orders_month: z.coerce.number().int().min(1).nullable(),
  features: z.array(z.enum(FEATURES)),
  is_active: z.boolean(),
  sort: z.coerce.number().int(),
});
export async function savePlanAction(input: z.input<typeof planSchema>, id?: string | null) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const d = planSchema.parse(input);
    const row = { code: d.code, name: d.name, description: d.description || null, price: d.price, features: d.features, is_active: d.is_active, sort: d.sort, limits: { max_members: d.max_members, max_products: d.max_products, max_orders_month: d.max_orders_month } };
    const res = id ? await supabase.from("plans").update(row).eq("id", zId.parse(id)).select("id") : await supabase.from("plans").insert(row).select("id");
    must(res);
    revalidatePath("/master", "layout");
    revalidatePath("/");
    return true;
  });
}

// ---------- Usuários -------------------------------------------------
export async function setPlatformAdminAction(userId: string, value: boolean) {
  return run(async () => {
    const { user, supabase } = await requireAdmin();
    if (userId === user.id && !value) fail("Você não pode remover o seu próprio acesso de administrador");
    must(await supabase.from("profiles").update({ is_platform_admin: value }).eq("id", zId.parse(userId)).select("id"));
    revalidatePath("/master/usuarios");
    return true;
  });
}

export async function sendPasswordResetAction(email: string) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const { env } = await import("@/lib/env");
    const { error } = await supabase.auth.resetPasswordForEmail(z.string().email().parse(email), { redirectTo: `${env.appUrl}/auth/callback?next=/redefinir-senha` });
    if (error) throw error;
    return true;
  });
}

// ---------- Configurações -------------------------------------------
const settingsSchema = z.object({
  signup: z.object({ enabled: z.boolean(), plan_code: z.string().min(2), trial_days: z.coerce.number().int().min(0).max(90) }),
  support: z.object({ whatsapp: z.string().trim().max(20).nullable(), email: z.string().trim().email("E-mail de suporte inválido").or(z.literal("")).nullable(), hours: z.string().trim().max(80).nullable() }),
});
export async function savePlatformSettingsAction(input: z.input<typeof settingsSchema>) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const d = settingsSchema.parse(input);
    const { data: plan } = await supabase.from("plans").select("id").eq("code", d.signup.plan_code).maybeSingle();
    if (!plan) fail("Plano padrão inexistente");
    must(await supabase.from("platform_settings").upsert([
      { key: "signup", value: d.signup, updated_at: new Date().toISOString() },
      { key: "support", value: { ...d.support, whatsapp: d.support.whatsapp?.replace(/\D/g, "") || null, email: d.support.email || null }, updated_at: new Date().toISOString() },
    ]));
    revalidatePath("/master/configuracoes");
    revalidatePath("/");
    return true;
  });
}

// ---------- Recebimento das mensalidades (Mercado Pago da plataforma) ----
export type PlatformPaymentStatus = { configured: boolean; live_mode: boolean; token_hint: string | null; has_webhook_secret: boolean };

export async function savePlatformPaymentAction(input: { access_token?: string; webhook_secret?: string }) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const token = (input.access_token ?? "").trim();
    if (token) {
      // confere no Mercado Pago antes de salvar (o token nunca volta ao navegador)
      const { checkToken } = await import("@/lib/payments/mercadopago");
      await checkToken(token).catch(() => fail("O Mercado Pago recusou este Access Token. Copie de novo em Suas integrações → Credenciais."));
    }
    const { data, error } = await supabase.rpc("set_platform_payment", { p_access_token: token || null, p_webhook_secret: (input.webhook_secret ?? "").trim() || null });
    if (error) throw error;
    revalidatePath("/master/configuracoes");
    return data as PlatformPaymentStatus;
  });
}

export async function testPlatformPaymentAction() {
  return run(async () => {
    await requireAdmin();
    const { platformSecrets } = await import("@/lib/payments/saas-billing");
    const { token } = await platformSecrets();
    if (!token) fail("Nenhum Access Token salvo");
    const { checkToken } = await import("@/lib/payments/mercadopago");
    const me = await checkToken(token as string).catch(() => fail("O Mercado Pago recusou o token salvo"));
    return { nickname: me.nickname };
  });
}

export async function removePlatformPaymentAction() {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.rpc("set_platform_payment", { p_remove: true });
    if (error) throw error;
    revalidatePath("/master/configuracoes");
    return true;
  });
}
