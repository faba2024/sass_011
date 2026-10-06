"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { ORG_COOKIE, requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { zOptText } from "@/lib/zod-helpers";
import { saveCategoryAction } from "@/app/app/(shell)/categorias/actions";
import { saveHoursAction } from "@/app/app/(shell)/configuracoes/actions";
import { saveZoneAction } from "@/app/app/(shell)/delivery/actions";
import { saveProductAction } from "@/app/app/(shell)/produtos/actions";

/** Cria a empresa do usuário logado (quando o cadastro exigiu confirmação de e-mail) */
export async function createOrganizationAction(input: { name: string; slug: string }) {
  return run(async () => {
    const d = z.object({ name: z.string().trim().min(2, "Informe o nome da hamburgueria").max(80), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Endereço inválido: use letras minúsculas, números e hífen") }).parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_my_organization", { p_name: d.name, p_slug: d.slug });
    if (error) fail(error.message);
    (await cookies()).set(ORG_COOKIE, String(data), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
    return String(data);
  });
}

async function updateOrg(step: number, data: Record<string, unknown>) {
  const ctx = await requireAction("settings.manage");
  const supabase = await createClient();
  const res = await supabase
    .from("organizations")
    .update({ ...data, onboarding_step: Math.max(ctx.org.onboarding_step, step) })
    .eq("id", ctx.org.id)
    .select("id");
  must(res);
  if (!res.data?.length) fail("Sem permissão para alterar esta empresa");
  revalidatePath("/app", "layout");
  revalidatePath(`/${ctx.org.slug}`, "layout");
  return true;
}

const digits = z.string().optional().nullable().transform((v) => (v ? v.replace(/\D/g, "") || null : null));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");

export async function stepIdentityAction(input: { name: string; description: string; whatsapp: string }) {
  return run(async () => {
    const d = z.object({ name: z.string().trim().min(2, "Informe o nome").max(80), description: zOptText(500), whatsapp: digits.refine((v) => !v || v.length >= 10, "WhatsApp inválido") }).parse(input);
    return updateOrg(1, d);
  });
}

export async function stepBrandAction(input: { logo_url: string | null; primary_color: string; secondary_color: string }) {
  return run(async () => updateOrg(2, z.object({ logo_url: zOptText(1000), primary_color: hex, secondary_color: hex }).parse(input)));
}

export async function stepAddressAction(input: Record<string, string>) {
  return run(async () => {
    const d = z
      .object({
        address_zip: digits.refine((v) => !!v && v.length === 8, "CEP inválido"),
        address_street: z.string().trim().min(2, "Informe a rua").max(120),
        address_number: z.string().trim().min(1, "Informe o número").max(20),
        address_district: z.string().trim().min(2, "Informe o bairro").max(80),
        address_complement: zOptText(80),
        address_city: z.string().trim().min(2, "Informe a cidade").max(80),
        address_state: z.string().trim().length(2, "UF com 2 letras").transform((v) => v.toUpperCase()),
      })
      .parse(input);
    return updateOrg(3, d);
  });
}

export async function stepHoursAction(shifts: { weekday: number; opens_at: string; closes_at: string }[]) {
  return run(async () => {
    if (!shifts.length) fail("Abra pelo menos um dia da semana");
    const r = await saveHoursAction(shifts);
    if (!r.ok) fail(r.error ?? "Não foi possível salvar os horários");
    return updateOrg(4, {});
  });
}

export async function stepDeliveryAction(input: { accepts_delivery: boolean; accepts_pickup: boolean; zone: { name: string; fee: number; eta_min: number; eta_max: number } | null }) {
  return run(async () => {
    if (!input.accepts_delivery && !input.accepts_pickup) fail("Escolha entrega, retirada ou as duas");
    if (input.accepts_delivery && input.zone) {
      const ctx = await requireAction("settings.manage");
      const supabase = await createClient();
      const { count } = await supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).is("deleted_at", null);
      if (!count) {
        const r = await saveZoneAction({ name: input.zone.name, zip_prefixes: [], fee: input.zone.fee, min_order: 0, eta_min: input.zone.eta_min, eta_max: input.zone.eta_max, is_active: true });
        if (!r.ok) fail(r.error ?? "Não foi possível criar a área de entrega");
      }
    }
    return updateOrg(5, { accepts_delivery: input.accepts_delivery, accepts_pickup: input.accepts_pickup });
  });
}

export async function stepProductAction(input: { category: string; name: string; description: string; price: number; image: string | null }) {
  return run(async () => {
    const d = z.object({ category: z.string().trim().min(1, "Informe a categoria").max(60), name: z.string().trim().min(1, "Informe o nome do produto").max(80), description: zOptText(600), price: z.coerce.number().positive("Informe o preço"), image: zOptText(1000) }).parse(input);
    const ctx = await requireAction(["settings.manage"]);
    const supabase = await createClient();
    const { data: existing } = await supabase.from("categories").select("id").eq("organization_id", ctx.org.id).ilike("name", d.category).is("deleted_at", null).maybeSingle();
    let categoryId = existing?.id as string | undefined;
    if (!categoryId) {
      const c = await saveCategoryAction({ name: d.category, description: null, is_active: true });
      if (!c.ok) fail(c.error ?? "Não foi possível criar a categoria");
      categoryId = c.data as string;
    }
    const p = await saveProductAction({
      type: "simple", category_id: categoryId, name: d.name, description: d.description, ingredients_text: null, price: d.price, promo_price: null, prep_minutes: 15,
      is_active: true, is_available: true, is_featured: true, auto_disable_on_stockout: false, images: d.image ? [d.image] : [], group_ids: [], recipe: null, combo_groups: null,
    });
    if (!p.ok) fail(p.error ?? "Não foi possível criar o produto");
    return updateOrg(6, {});
  });
}

export async function finishOnboardingAction() {
  return run(async () => updateOrg(6, { onboarding_completed_at: new Date().toISOString() }));
}
