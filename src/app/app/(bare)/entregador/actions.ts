"use server";
import { z } from "zod";
import { fail, must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setMyDriverStatusAction(status: "available" | "offline") {
  return run(async () => {
    const ctx = await requireAction("deliveries.own");
    const s = z.enum(["available", "offline"]).parse(status);
    const supabase = await createClient();
    const { data } = await supabase.from("drivers").select("id, status").eq("organization_id", ctx.org.id).eq("user_id", ctx.userId).maybeSingle();
    if (!data) fail("Você não está cadastrado como entregador");
    if (data.status === "on_delivery" && s === "offline") fail("Finalize as entregas em andamento antes de ficar offline");
    must(await supabase.from("drivers").update({ status: s }).eq("id", data.id));
    return true;
  });
}
