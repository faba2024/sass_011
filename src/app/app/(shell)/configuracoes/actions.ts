"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { zId, zOptText } from "@/lib/zod-helpers";

async function updateOrg(data: Record<string, unknown>) {
  const ctx = await requireAction("settings.manage");
  const supabase = await createClient();
  const res = await supabase.from("organizations").update(data).eq("id", ctx.org.id).select("id");
  must(res);
  if (!res.data?.length) fail("Não foi possível salvar (sem permissão)");
  revalidatePath("/app", "layout");
  revalidatePath(`/${ctx.org.slug}`, "layout");
  return true;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
const digits = z.string().optional().nullable().transform((v) => (v ? v.replace(/\D/g, "") || null : null));

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  description: zOptText(500),
  legal_name: zOptText(120),
  cnpj: zOptText(20),
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")).transform((v) => v || null),
  phone: digits,
  whatsapp: digits,
  instagram: z.string().optional().nullable().transform((v) => (v ? v.replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/.*/, "").trim() || null : null)),
  address_zip: digits,
  address_street: zOptText(120),
  address_number: zOptText(20),
  address_district: zOptText(80),
  address_complement: zOptText(80),
  address_city: zOptText(80),
  address_state: zOptText(2),
  logo_url: zOptText(1000),
  banner_url: zOptText(1000),
  primary_color: hex,
  secondary_color: hex,
});
export async function saveProfileAction(input: z.input<typeof profileSchema>) {
  return run(() => updateOrg(profileSchema.parse(input)));
}

const ordersSchema = z
  .object({
    accepts_delivery: z.boolean(),
    accepts_pickup: z.boolean(),
    accepts_dine_in: z.boolean(),
    allow_scheduling: z.boolean(),
    auto_confirm_table_orders: z.boolean(),
    min_order_value: z.coerce.number().min(0),
    pickup_eta_min: z.coerce.number().int().min(0).max(240),
    pickup_eta_max: z.coerce.number().int().min(0).max(240),
    closed_message: z.string().trim().min(3, "Informe a mensagem de loja fechada").max(160),
    timezone: z.string().min(3),
  })
  .refine((d) => d.accepts_delivery || d.accepts_pickup || d.accepts_dine_in, { message: "Habilite pelo menos uma forma de receber pedidos" })
  .refine((d) => d.pickup_eta_max >= d.pickup_eta_min, { message: "Tempo máximo de retirada menor que o mínimo" });
export async function saveOrderSettingsAction(input: z.input<typeof ordersSchema>) {
  return run(() => updateOrg(ordersSchema.parse(input)));
}

const paySchema = z
  .object({
    accepts_pix: z.boolean(),
    accepts_cash: z.boolean(),
    accepts_card: z.boolean(),
    pix_key: zOptText(100),
    pix_key_type: z.enum(["cpf", "cnpj", "phone", "email", "random"]).nullable(),
    pix_holder_name: zOptText(60),
    pix_city: zOptText(40),
  })
  .refine((d) => d.accepts_pix || d.accepts_cash || d.accepts_card, { message: "Habilite pelo menos uma forma de pagamento" })
  .refine((d) => !d.accepts_pix || (d.pix_key && d.pix_key_type), { message: "Informe a chave Pix e o tipo" });
export async function savePaymentSettingsAction(input: z.input<typeof paySchema>) {
  return run(() => updateOrg(paySchema.parse(input)));
}

const crmSchema = z.object({ vip_min_orders: z.coerce.number().int().min(1), vip_min_spent: z.coerce.number().min(0), inactive_days: z.coerce.number().int().min(7).max(365) });
export async function saveCrmSettingsAction(input: z.input<typeof crmSchema>) {
  return run(() => updateOrg(crmSchema.parse(input)));
}

const hoursSchema = z.array(z.object({ weekday: z.number().int().min(0).max(6), opens_at: z.string().regex(/^\d{2}:\d{2}$/), closes_at: z.string().regex(/^\d{2}:\d{2}$/) }).refine((s) => s.opens_at !== s.closes_at, { message: "Abertura e fechamento iguais" })).max(28);
export async function saveHoursAction(shifts: z.input<typeof hoursSchema>) {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const list = hoursSchema.parse(shifts);
    const supabase = await createClient();
    must(await supabase.from("opening_hours").delete().eq("organization_id", ctx.org.id));
    if (list.length) must(await supabase.from("opening_hours").insert(list.map((s) => ({ ...s, organization_id: ctx.org.id }))));
    revalidatePath("/app/configuracoes");
    revalidatePath(`/${ctx.org.slug}`, "layout");
    return true;
  });
}

const exSchema = z
  .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data"), is_closed: z.boolean(), opens_at: z.string().nullable(), closes_at: z.string().nullable(), reason: zOptText(80) })
  .refine((d) => d.is_closed || (d.opens_at && d.closes_at), { message: "Informe o horário especial" });
export async function addExceptionAction(input: z.input<typeof exSchema>) {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const d = exSchema.parse(input);
    const supabase = await createClient();
    must(await supabase.from("opening_exceptions").upsert({ ...d, opens_at: d.is_closed ? null : d.opens_at, closes_at: d.is_closed ? null : d.closes_at, organization_id: ctx.org.id }, { onConflict: "organization_id,date" }));
    revalidatePath("/app/configuracoes");
    revalidatePath(`/${ctx.org.slug}`, "layout");
    return true;
  });
}
export async function deleteExceptionAction(id: string) {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const supabase = await createClient();
    must(await supabase.from("opening_exceptions").delete().eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/configuracoes");
    return true;
  });
}

// ---------- Pix automático (Mercado Pago) ----------------------------
export type PaymentIntegrationStatus = { configured: boolean; is_enabled: boolean; provider?: string; live_mode?: boolean; token_hint?: string; has_webhook_secret?: boolean; updated_at?: string };

const integSchema = z.object({
  enabled: z.boolean(),
  access_token: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
  webhook_secret: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
});
export async function savePaymentIntegrationAction(input: z.input<typeof integSchema>) {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const d = integSchema.parse(input);
    if (d.access_token) {
      // valida a credencial no Mercado Pago antes de salvar
      const { checkToken } = await import("@/lib/payments/mercadopago");
      await checkToken(d.access_token).catch((e: Error) => fail(e.message));
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_payment_integration", { p_org: ctx.org.id, p_enabled: d.enabled, p_access_token: d.access_token, p_webhook_secret: d.webhook_secret });
    if (error) throw error;
    revalidatePath("/app/configuracoes");
    return data as PaymentIntegrationStatus;
  });
}

export async function testPaymentIntegrationAction() {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const { loadIntegration } = await import("@/lib/payments/pix-service");
    const { checkToken } = await import("@/lib/payments/mercadopago");
    const integ = await loadIntegration(ctx.org.id);
    if (!integ) fail("Nenhuma conta do Mercado Pago configurada");
    const me = await checkToken(integ.access_token).catch((e: Error) => fail(e.message));
    return { nickname: me.nickname, site: me.site };
  });
}

export async function removePaymentIntegrationAction() {
  return run(async () => {
    const ctx = await requireAction("settings.manage");
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_payment_integration", { p_org: ctx.org.id });
    if (error) throw error;
    revalidatePath("/app/configuracoes");
    return true;
  });
}

// ---------- Mensalidade online (Pix da plataforma) --------------------
export async function startSubscriptionPaymentAction() {
  return run(async () => {
    const ctx = await requireAction("billing.view");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("billing_open_invoice", { p_org: ctx.org.id });
    if (error) throw error;
    const inv = data as { id: string };
    const { chargeInvoice } = await import("@/lib/payments/saas-billing");
    const charge = await chargeInvoice(ctx.org.id, inv.id, ctx.org.name).catch((e: Error) => fail(e.message));
    revalidatePath("/app/configuracoes");
    return charge;
  });
}

export async function checkSubscriptionPaymentAction(paymentId: string) {
  return run(async () => {
    const ctx = await requireAction("billing.view");
    const { checkInvoice } = await import("@/lib/payments/saas-billing");
    const r = await checkInvoice(ctx.org.id, zId.parse(paymentId)).catch((e: Error) => fail(e.message));
    if (r.paid) revalidatePath("/app", "layout");
    return { paid: r.paid };
  });
}

// ---------- Escolher / trocar plano (upgrade ou downgrade) ------------
export async function choosePlanAction(planCode: string) {
  return run(async () => {
    const ctx = await requireAction("billing.view");
    const supabase = await createClient();
    const code = z.enum(["STARTER", "PRO", "PREMIUM"]).or(z.string().regex(/^[A-Z0-9_]{2,30}$/)).parse(planCode.toUpperCase());
    const { data, error } = await supabase.rpc("choose_plan", { p_org: ctx.org.id, p_plan_code: code });
    if (error) throw error;
    revalidatePath("/app", "layout");
    return data as { plan_name: string; trial_active: boolean };
  });
}
