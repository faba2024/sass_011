import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { hasFeature, requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerDetail, type CustomerFull } from "./customer-detail";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("customers.view", "clientes");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*, customer_addresses(id, zip, street, number, district, complement, reference, city, last_used_at)").eq("id", id).eq("organization_id", ctx.org.id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  const [{ data: seg }, { data: orders }, { data: account }, { data: txs }, { data: rewards }, { data: program }, { data: reviews }] = await Promise.all([
    supabase.from("customer_segments").select("segment, avg_ticket").eq("customer_id", id).maybeSingle(),
    supabase.from("orders").select("id, number, created_at, status, type, total, payment_method").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("loyalty_accounts").select("points_balance, lifetime_points").eq("customer_id", id).maybeSingle(),
    supabase.from("loyalty_transactions").select("id, kind, points, description, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("loyalty_rewards").select("id, name, points_cost").eq("organization_id", ctx.org.id).eq("is_active", true).order("points_cost"),
    supabase.from("loyalty_programs").select("is_enabled").eq("organization_id", ctx.org.id).maybeSingle(),
    supabase.from("reviews").select("id, rating, comment, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <LinkButton href="/app/clientes" variant="ghost" size="sm" icon="arrow-left" className="-ml-2 mb-3">Clientes</LinkButton>
      <CustomerDetail
        customer={c as CustomerFull}
        segment={(seg as { segment: string; avg_ticket: number } | null) ?? { segment: "new", avg_ticket: 0 }}
        orders={orders ?? []}
        loyalty={{ enabled: Boolean(program?.is_enabled) && hasFeature(ctx, "fidelidade"), balance: account?.points_balance ?? 0, lifetime: account?.lifetime_points ?? 0, transactions: txs ?? [], rewards: rewards ?? [] }}
        reviews={reviews ?? []}
        tz={ctx.org.timezone}
      />
    </div>
  );
}
