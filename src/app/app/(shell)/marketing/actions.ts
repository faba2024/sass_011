"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, hardDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zText } from "@/lib/zod-helpers";

const schema = z
  .object({
    name: zText(2, 80, "Dê um nome à campanha"),
    segment: z.enum(["all", "new", "recurring", "vip", "inactive", "tag"]),
    tag: z.string().trim().toLowerCase().max(30).optional().nullable().transform((v) => v || null),
    message: zText(5, 1000, "Escreva a mensagem"),
  })
  .refine((d) => d.segment !== "tag" || d.tag, { message: "Informe a tag" });

export async function saveCampaignAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => (await saveRow("campaigns", "marketing.manage", schema.parse(input), id ? zId.parse(id) : null, { feature: "marketing", revalidate: "/app/marketing" })).id);
}

export async function deleteCampaignAction(id: string) {
  return run(() => hardDelete("campaigns", "marketing.manage", zId.parse(id), "/app/marketing"));
}

/** Monta a lista de destinatários a partir do segmento (clientes com telefone) */
export async function buildRecipientsAction(campaignId: string) {
  return run(async () => {
    const ctx = await requireAction("marketing.manage", "marketing");
    const supabase = await createClient();
    const c = must(await supabase.from("campaigns").select("id, segment, tag").eq("id", zId.parse(campaignId)).eq("organization_id", ctx.org.id).single()) as { id: string; segment: string; tag: string | null };
    let ids: string[] = [];
    if (c.segment === "all" || c.segment === "tag") {
      let q = supabase.from("customers").select("id").eq("organization_id", ctx.org.id).is("deleted_at", null).not("phone", "is", null).limit(5000);
      if (c.segment === "tag" && c.tag) q = q.contains("tags", [c.tag]);
      ids = ((await q).data ?? []).map((r: { id: string }) => r.id);
    } else {
      ids = ((await supabase.from("customer_segments").select("customer_id").eq("organization_id", ctx.org.id).eq("segment", c.segment).limit(5000)).data ?? []).map((r: { customer_id: string }) => r.customer_id);
    }
    if (!ids.length) fail("Nenhum cliente neste segmento");
    const { data: customers } = await supabase.from("customers").select("id, name, phone").in("id", ids.slice(0, 2000)).not("phone", "is", null);
    if (!customers?.length) fail("Nenhum cliente com telefone neste segmento");
    must(await supabase.from("campaign_recipients").upsert(customers.map((cu: { id: string; name: string; phone: string }) => ({ organization_id: ctx.org.id, campaign_id: c.id, customer_id: cu.id, phone: cu.phone, name: cu.name })), { onConflict: "campaign_id,customer_id", ignoreDuplicates: true }));
    must(await supabase.from("campaigns").update({ status: "sending" }).eq("id", c.id));
    revalidatePath("/app/marketing");
    return customers.length;
  });
}

export async function markRecipientSentAction(recipientId: string, sent: boolean) {
  return run(async () => {
    const ctx = await requireAction("marketing.manage");
    const supabase = await createClient();
    must(await supabase.from("campaign_recipients").update({ sent_at: sent ? new Date().toISOString() : null, sent_by: sent ? ctx.userId : null }).eq("id", zId.parse(recipientId)).eq("organization_id", ctx.org.id));
    return true;
  });
}

export async function finishCampaignAction(id: string) {
  return run(async () => (await saveRow("campaigns", "marketing.manage", { status: "done" }, zId.parse(id), { revalidate: "/app/marketing" })).id);
}
