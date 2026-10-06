import { requirePage } from "@/lib/auth";
import { storeUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { QrSheet } from "./qr-sheet";

export const metadata = { title: "QR Codes das mesas" };

export default async function PrintTablesPage() {
  const ctx = await requirePage("tables.manage", "mesas");
  const supabase = await createClient();
  const { data } = await supabase.from("dining_tables").select("id, label, qr_token").eq("organization_id", ctx.org.id).eq("is_active", true).is("deleted_at", null).order("sort");
  return <QrSheet orgName={ctx.org.name} logo={ctx.org.logo_url} items={(data ?? []).map((t: { id: string; label: string; qr_token: string }) => ({ id: t.id, label: t.label, url: storeUrl(ctx.org.slug, `/mesa/${t.qr_token}`) }))} />;
}
