import { PageHeader } from "@/components/ui/layout";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "./templates-manager";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  const ctx = await requirePage("marketing.manage");
  const supabase = await createClient();
  const [{ data: templates }, { data: log }] = await Promise.all([
    supabase.from("whatsapp_templates").select("id, key, name, body, is_active").eq("organization_id", ctx.org.id).order("name"),
    supabase.from("whatsapp_messages").select("id, template_key, phone, body, created_at, order_id").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <>
      <PageHeader title="WhatsApp" description="Mensagens prontas para cada etapa do pedido. Abrem no WhatsApp do atendente — sem API paga. O pedido continua acontecendo dentro da plataforma." />
      <TemplatesManager templates={templates ?? []} log={log ?? []} orgName={ctx.org.name} slug={ctx.org.slug} whatsapp={ctx.org.whatsapp} tz={ctx.org.timezone} />
    </>
  );
}
