import "server-only";
import { revalidatePath } from "next/cache";
import { must } from "@/lib/action";
import { requireAction } from "@/lib/auth";
import type { Feature, Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/** Insere ou atualiza uma linha SEMPRE presa à organização ativa (RLS confere de novo no banco). */
export async function saveRow(table: string, perm: Permission | Permission[], data: Record<string, unknown>, id?: string | null, opts: { feature?: Feature; revalidate?: string } = {}) {
  const ctx = await requireAction(perm, opts.feature);
  const supabase = await createClient();
  let rowId = id ?? null;
  if (id) {
    must(await supabase.from(table).update(data).eq("id", id).eq("organization_id", ctx.org.id));
  } else {
    const row = must(await supabase.from(table).insert({ ...data, organization_id: ctx.org.id }).select("id").single()) as { id: string };
    rowId = row.id;
  }
  if (opts.revalidate) revalidatePath(opts.revalidate);
  return { id: rowId as string, ctx, supabase };
}

export async function softDelete(table: string, perm: Permission | Permission[], id: string, revalidate?: string) {
  const ctx = await requireAction(perm);
  const supabase = await createClient();
  must(await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("organization_id", ctx.org.id));
  if (revalidate) revalidatePath(revalidate);
  return true;
}

export async function hardDelete(table: string, perm: Permission | Permission[], id: string, revalidate?: string) {
  const ctx = await requireAction(perm);
  const supabase = await createClient();
  must(await supabase.from(table).delete().eq("id", id).eq("organization_id", ctx.org.id));
  if (revalidate) revalidatePath(revalidate);
  return true;
}

/** Reordena linhas (ids na nova ordem) */
export async function reorder(table: string, perm: Permission, ids: string[], revalidate?: string) {
  const ctx = await requireAction(perm);
  const supabase = await createClient();
  await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort: i + 1 }).eq("id", id).eq("organization_id", ctx.org.id)));
  if (revalidate) revalidatePath(revalidate);
  return true;
}
