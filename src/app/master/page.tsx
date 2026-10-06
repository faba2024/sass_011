import Link from "next/link";
import { BarChart, RankList } from "@/components/ui/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Notice } from "@/components/ui/states";
import { integer, money, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

interface Overview {
  organizations: number; orgs_active: number; orgs_suspended: number; new_orgs_30d: number;
  subs: Record<string, number>; mrr: number; mrr_trial_potential: number; received_month: number;
  overdue: number; overdue_count: number; trials_ending_7d: number; orders_30d: number; gmv_30d: number; users: number;
  plans: { code: string; name: string; count: number }[];
  growth: { month: string; orgs: number; revenue: number }[];
}

export default async function MasterHome() {
  const supabase = await createClient();
  await supabase.rpc("platform_refresh_billing");
  const [{ data, error }, { data: recent }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase.rpc("platform_organizations", { p_search: null, p_status: null }).limit(8),
  ]);
  if (error || !data) return <Notice tone="error">Não foi possível carregar a visão geral: {error?.message}</Notice>;
  const o = data as Overview;
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const label = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Visão geral" description="Assinaturas, receita recorrente e uso do TOP BURGER OS." />
      <StatStrip className="mb-6">
        <Stat label="MRR (assinaturas ativas)" value={money(o.mrr)} hint={`+ ${money(o.mrr_trial_potential)} em trial`} />
        <Stat label="Recebido no mês" value={money(o.received_month)} />
        <Stat label="Em atraso" value={money(o.overdue)} hint={`${o.overdue_count} fatura(s)`} />
        <Stat label="Empresas ativas" value={integer(o.orgs_active)} hint={`${o.new_orgs_30d} novas em 30 dias`} />
      </StatStrip>
      <StatStrip className="mb-6">
        <Stat label="Em trial" value={integer(o.subs.trialing ?? 0)} hint={`${o.trials_ending_7d} terminam em 7 dias`} />
        <Stat label="Suspensas" value={integer(o.orgs_suspended)} />
        <Stat label="Pedidos (30 dias)" value={integer(o.orders_30d)} />
        <Stat label="Vendido pelas lojas (30 dias)" value={money(o.gmv_30d)} />
      </StatStrip>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Receita de assinaturas" description="Faturas pagas por mês" />
          <BarChart data={o.growth.map((g) => ({ label: label(g.month), value: Number(g.revenue), hint: `${g.orgs} nova(s)` }))} format={money} highlightLast />
        </Card>
        <Card>
          <CardHeader title="Empresas por plano" description="Ativas e em trial" />
          <RankList items={o.plans.map((p) => ({ label: p.name, value: p.count }))} format={(v) => integer(v)} />
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Cadastros recentes" actions={<Link href="/master/empresas" className="text-[13px] font-medium text-ember-600 hover:underline">Ver todas</Link>} />
        <ul className="divide-y divide-line">
          {((recent ?? []) as { id: string; name: string; slug: string; plan_name: string | null; sub_status: string | null; created_at: string; owner_email: string | null }[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
              <Link href={`/master/empresas?q=${r.slug}`} className="font-medium hover:underline">{r.name}</Link>
              <span className="text-muted">{r.owner_email}</span>
              <span className="ml-auto text-muted">{r.plan_name} · {shortDate(r.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
