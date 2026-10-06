"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { zId } from "@/lib/zod-helpers";

export async function replyReviewAction(id: string, reply: string) {
  return run(async () => {
    const ctx = await requireAction("reviews.manage");
    const text = z.string().trim().max(600).parse(reply);
    const supabase = await createClient();
    must(await supabase.from("reviews").update({ reply: text || null, replied_at: text ? new Date().toISOString() : null }).eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/avaliacoes");
    return true;
  });
}

export async function toggleReviewHiddenAction(id: string, hidden: boolean) {
  return run(async () => {
    const ctx = await requireAction("reviews.manage");
    const supabase = await createClient();
    must(await supabase.from("reviews").update({ is_hidden: hidden }).eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/avaliacoes");
    return true;
  });
}
