import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CampaignsManager, type Campaign } from "./campaigns-manager";

export const metadata = { title: "Marketing" };

export default async function MarketingPage() {
  const ctx = await requirePage("marketing.manage", "marketing");
  const supabase = await createClient();
  const [{ data: campaigns }, { data: segs }, { data: tagsRows }] = await Promise.all([
    supabase.from("campaigns").select("id, name, segment, tag, message, status, created_at, campaign_recipients(id, name, phone, sent_at)").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }),
    supabase.from("customer_segments").select("segment").eq("organization_id", ctx.org.id).limit(5000),
    supabase.from("customers").select("tags").eq("organization_id", ctx.org.id).is("deleted_at", null).limit(5000),
  ]);
  const counts: Record<string, number> = { all: segs?.length ?? 0 };
  for (const s of segs ?? []) counts[s.segment] = (counts[s.segment] ?? 0) + 1;
  const tags = [...new Set<string>((tagsRows ?? []).flatMap((t: { tags: string[] }) => t.tags))].sort();
  return (
    <>
      <PageHeader title="Marketing" description="Campanhas por segmento com mensagens prontas para WhatsApp. Sem API paga: você envia com um toque por cliente." />
      <CampaignsManager campaigns={(campaigns ?? []) as Campaign[]} counts={counts} tags={tags} orgName={ctx.org.name} slug={ctx.org.slug} />
    </>
  );
}
