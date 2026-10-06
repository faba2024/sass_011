"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { must, run } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import { saveRow, softDelete } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { zId, zText } from "@/lib/zod-helpers";

const schema = z.object({ label: zText(1, 30, "Informe o nome da mesa"), seats: z.coerce.number().int().min(1).max(50), is_active: z.boolean() });

export async function saveTableAction(input: z.input<typeof schema>, id?: string | null) {
  return run(async () => {
    if (!id) {
      const ctx = await requireAction("tables.manage", "mesas");
      const supabase = await createClient();
      const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id);
      return (await saveRow("dining_tables", "tables.manage", { ...schema.parse(input), sort: (count ?? 0) + 1 }, null, { revalidate: "/app/mesas" })).id;
    }
    return (await saveRow("dining_tables", "tables.manage", schema.parse(input), zId.parse(id), { revalidate: "/app/mesas" })).id;
  });
}

export async function createTablesBatchAction(count: number, prefix: string) {
  return run(async () => {
    const ctx = await requireAction("tables.manage", "mesas");
    const n = z.coerce.number().int().min(1).max(100).parse(count);
    const supabase = await createClient();
    const { count: existing } = await supabase.from("dining_tables").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id);
    const start = (existing ?? 0) + 1;
    must(await supabase.from("dining_tables").insert(Array.from({ length: n }, (_, i) => ({ organization_id: ctx.org.id, label: `${prefix.trim() || "Mesa"} ${String(start + i).padStart(2, "0")}`, sort: start + i }))));
    revalidatePath("/app/mesas");
    return n;
  });
}

export async function deleteTableAction(id: string) {
  return run(() => softDelete("dining_tables", "tables.manage", zId.parse(id), "/app/mesas"));
}

export async function regenerateQrAction(id: string) {
  return run(async () => {
    const ctx = await requireAction("tables.manage");
    const supabase = await createClient();
    must(await supabase.from("dining_tables").update({ qr_token: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("") }).eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/mesas");
    return true;
  });
}

export async function setTableStatusAction(id: string, status: "free" | "occupied" | "awaiting_payment") {
  return run(async () => {
    const ctx = await requireAction("tables.manage");
    const supabase = await createClient();
    must(await supabase.from("dining_tables").update({ status: z.enum(["free", "occupied", "awaiting_payment"]).parse(status) }).eq("id", zId.parse(id)).eq("organization_id", ctx.org.id));
    revalidatePath("/app/mesas");
    return true;
  });
}

export async function closeTableAction(sessionId: string, method: "pix" | "cash" | "card") {
  return run(async () => {
    await requireAction(["tables.manage", "cash.operate"]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("close_table_session", { p_session: zId.parse(sessionId), p_method: method });
    if (error) throw error;
    revalidatePath("/app/mesas");
    return data as { total: number };
  });
}
