import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { Logo, LogoMark } from "@/components/ui/logo";
import { getUser } from "@/lib/auth";
import { money, phone as fmtPhone } from "@/lib/format";
import { FEATURE_LABELS, type Feature } from "@/lib/permissions";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: { absolute: "TOP BURGER OS — o sistema da sua hamburgueria" },
  description: "Cardápio online com pedido de verdade, cozinha em tempo real, delivery, caixa, estoque por ficha técnica, financeiro e fidelidade. Feito para hamburguerias.",
};
export const revalidate = 300;

type Plan = { code: string; name: string; description: string | null; price: number; limits: { max_members: number | null; max_products: number | null; max_orders_month: number | null }; features: Feature[] };

async function loadPublic() {
  try {
    const sb = createPublicClient();
    const [{ data: plans }, { data: info }, { data: demoFree }] = await Promise.all([
      sb.from("plans").select("code, name, description, price, limits, features").eq("is_active", true).order("sort"),
      sb.rpc("platform_public"),
      sb.rpc("slug_available", { p_slug: "leviburguer" }),
    ]);
    return { hasDemo: demoFree === false, plans: (plans ?? []) as Plan[], info: (info ?? null) as { support: { whatsapp?: string | null; email?: string | null; hours?: string | null }; trial_days: number; signup_enabled: boolean } | null };
  } catch {
    return { hasDemo: false, plans: [] as Plan[], info: null };
  }
}

const FLOW: { icon: IconName; title: string; text: string }[] = [
  { icon: "bag", title: "Cliente pede no cardápio", text: "Escolhe o ponto da carne, tira a cebola, soma bacon. Preço muda na hora e o total é recalculado no servidor." },
  { icon: "bell", title: "Toca no painel", text: "Pedido entra no quadro com som. Um clique confirma e manda para a chapa." },
  { icon: "flame", title: "Cozinha vê na tela", text: "Tela de cozinha com tempo de cada pedido, itens alterados destacados e “pronto” com um toque." },
  { icon: "bike", title: "Entregador sai", text: "App do entregador com endereço, troco e botão de rota. Cliente acompanha em tempo real." },
  { icon: "register", title: "Caixa fecha sozinho", text: "Pagamento entra no caixa e no financeiro, estoque baixa pela ficha técnica, cliente ganha pontos." },
];

const MODULES: { icon: IconName; title: string; text: string }[] = [
  { icon: "menu-book", title: "Cardápio online", text: "Link próprio, QR na mesa, adicionais com mínimo e máximo, combos por etapas e carrinho que não se perde." },
  { icon: "kanban", title: "Pedidos e KDS", text: "Quadro por status, histórico de cada mudança, impressão de comanda e cancelamento com motivo." },
  { icon: "boxes", title: "Estoque por ficha técnica", text: "Cada burger desconta pão, carne, queijo e embalagem. Alerta de estoque baixo e CMV real." },
  { icon: "wallet", title: "Caixa e financeiro", text: "Abertura, sangria, suprimento, fechamento com diferença. Despesas recorrentes e lucro do mês." },
  { icon: "users", title: "Clientes e fidelidade", text: "Histórico de cada cliente, VIPs e inativos, pontos por real gasto e recompensas." },
  { icon: "tag", title: "Cupons", text: "Percentual, valor fixo, frete grátis ou produto grátis, com limite, validade e pedido mínimo." },
  { icon: "map-pin", title: "Delivery por bairro", text: "Taxa e tempo por área ou CEP, pedido mínimo por região e controle de entregadores." },
  { icon: "chart", title: "Relatórios", text: "Faturamento, ticket médio, horários de pico, produtos campeões e desempenho por canal." },
  { icon: "lock", title: "Equipe com permissões", text: "Atendente, caixa, cozinha, entregador e gerente — cada um vê só o que precisa." },
];

export default async function Home() {
  const [{ plans, info, hasDemo }, user] = await Promise.all([loadPublic(), getUser().catch(() => null)]);
  const trial = info?.trial_days ?? 15;
  const support = info?.support ?? {};
  const featureOrder = Object.keys(FEATURE_LABELS) as Feature[];

  return (
    <div className="bg-paper text-ink">
      {/* Topo */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="TOP BURGER OS"><Logo /></Link>
          <nav className="hidden items-center gap-7 text-[14px] text-ink-2 md:flex">
            <a href="#como-funciona" className="hover:text-ink">Como funciona</a>
            <a href="#modulos" className="hover:text-ink">Módulos</a>
            <a href="#planos" className="hover:text-ink">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href={user.isPlatformAdmin ? "/master" : "/app"} className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[14px] font-semibold text-white hover:bg-char-700">Abrir painel</Link>
            ) : (
              <>
                <Link href="/login" className="hidden h-10 items-center rounded-lg px-3 text-[14px] font-medium hover:bg-sunken sm:inline-flex">Entrar</Link>
                <Link href="/cadastro" className="inline-flex h-10 items-center rounded-lg bg-ember-500 px-4 text-[14px] font-semibold text-white hover:bg-ember-600">Testar grátis</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ember-600">Sistema para hamburguerias</p>
            <h1 className="mt-4 font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[56px] xl:text-[64px]">
              O pedido sai do celular do cliente e <span className="relative whitespace-nowrap"><span className="relative z-10">chega na chapa</span><span aria-hidden className="absolute inset-x-0 bottom-1.5 -z-0 h-3 bg-mustard-400/70 sm:bottom-2 sm:h-4" /></span>.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
              Cardápio online com pedido de verdade, cozinha em tempo real, entrega, caixa, estoque por ficha técnica e fidelidade. Sem comissão por pedido, sem lista no WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/cadastro" className="inline-flex h-12 items-center gap-2 rounded-lg bg-ember-500 px-6 text-[15px] font-semibold text-white shadow-pop hover:bg-ember-600">
                Começar {trial > 0 ? `${trial} dias grátis` : "agora"} <Icon name="arrow-right" size={18} />
              </Link>
              {hasDemo && (
                <Link href="/leviburguer" className="inline-flex h-12 items-center gap-2 rounded-lg border border-line-strong px-5 text-[15px] font-medium hover:bg-surface">
                  Ver cardápio de demonstração
                </Link>
              )}
            </div>
            <p className="mt-4 text-[13px] text-muted">Sem cartão de crédito para testar. Cancele quando quiser.</p>
          </div>

          {/* Comandas */}
          <div className="relative mx-auto h-[420px] w-full max-w-[460px] sm:h-[460px]" aria-hidden>
            <div className="absolute inset-0 rounded-2xl border border-line bg-char-900 p-4 shadow-pop">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-char-400">
                <span>Cozinha · ao vivo</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-pickle-500" />3 em preparo</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { n: "#1061", t: "04:12", items: ["2x Smash Bacon", "  − sem picles", "1x Batata média"], tone: "bg-[#fffdf8]" },
                  { n: "#1062", t: "02:40", items: ["1x Levi Especial", "  + bacon extra", "  ponto: mal passado"], tone: "bg-[#fffdf8]" },
                  { n: "#1063", t: "00:58", items: ["1x Combo Levi", "  Coca-Cola lata", "1x Brownie"], tone: "bg-mustard-50" },
                  { n: "#1064", t: "00:12", items: ["3x Cheddar Duplo", "MESA 4"], tone: "bg-ember-50" },
                ].map((c) => (
                  <div key={c.n} className={`ticket-edge ${c.tone} px-3 py-3 font-mono text-[11px] text-ink`}>
                    <div className="flex justify-between font-bold"><span>{c.n}</span><span>{c.t}</span></div>
                    <div className="rule-dashed my-2" />
                    {c.items.map((i) => <p key={i} className={i.startsWith("  ") ? "pl-2 text-ink-2" : "font-bold"}>{i.trim()}</p>)}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-4 w-56 rotate-[-4deg] rounded-xl border border-line bg-surface p-4 shadow-pop sm:-left-10">
              <p className="text-[11px] text-muted">Pedido #1058</p>
              <p className="font-display text-[17px] font-semibold">Saiu para entrega</p>
              <div className="mt-3 flex gap-1">{[1, 1, 1, 1, 0].map((on, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${on ? "bg-ember-500" : "bg-line"}`} />)}</div>
              <p className="num mt-3 text-[13px] font-semibold">R$ 77,80 · Pix</p>
            </div>
          </div>
        </div>
      </section>

      {/* Fluxo */}
      <section id="como-funciona" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-[1.08]">Um pedido, nenhum papel, tudo conectado.</h2>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((s, i) => (
              <li key={s.title} className="bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-ember-50 text-ember-600"><Icon name={s.icon} size={20} /></span>
                  <span className="font-mono text-xs text-faint">0{i + 1}</span>
                </div>
                <p className="mt-4 font-semibold">{s.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-[1.08]">Tudo o que a operação de uma hamburgueria pede.</h2>
          <p className="max-w-sm text-[15px] text-muted">Cada hamburgueria tem seus dados isolados, equipe com permissões e cardápio com a própria marca.</p>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="flex gap-4">
              <Icon name={m.icon} size={22} className="mt-0.5 shrink-0 text-ember-500" />
              <div>
                <p className="font-semibold">{m.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="bg-char-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-[40px]">Planos</h2>
          <p className="mt-3 max-w-xl text-[15px] text-char-200">Mensalidade fixa. Sem taxa por pedido. {trial > 0 && `${trial} dias para testar com todos os pedidos reais.`}</p>
          {plans.length === 0 ? (
            <p className="mt-10 text-char-400">Os planos aparecem aqui assim que a plataforma estiver configurada.</p>
          ) : (
            <div className={`mt-12 grid gap-4 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
              {plans.map((p, i) => {
                const highlight = plans.length >= 3 && i === 1;
                return (
                  <div key={p.code} className={`flex flex-col rounded-xl border p-6 ${highlight ? "border-mustard-400 bg-char-800" : "border-white/10 bg-char-850"}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-display text-xl font-semibold">{p.name}</p>
                      {highlight && <span className="rounded bg-mustard-400 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-char-900">Mais escolhido</span>}
                    </div>
                    {p.description && <p className="mt-2 text-[13.5px] text-char-200">{p.description}</p>}
                    <p className="num mt-6 font-display text-[42px] font-semibold leading-none">{money(p.price)}<span className="ml-1 text-[14px] font-normal text-char-400">/mês</span></p>
                    <ul className="mt-6 space-y-2 text-[13.5px]">
                      <li className="text-char-200">{p.limits.max_members ? `Até ${p.limits.max_members} usuários` : "Usuários ilimitados"} · {p.limits.max_products ? `${p.limits.max_products} produtos` : "produtos ilimitados"}</li>
                      <li className="text-char-200">{p.limits.max_orders_month ? `Até ${p.limits.max_orders_month.toLocaleString("pt-BR")} pedidos/mês` : "Pedidos ilimitados"}</li>
                      {featureOrder.filter((f) => p.features.includes(f)).map((f) => (
                        <li key={f} className="flex items-center gap-2"><Icon name="check" size={15} className="text-mustard-400" />{FEATURE_LABELS[f]}</li>
                      ))}
                    </ul>
                    <Link href="/cadastro" className={`mt-8 inline-flex h-11 items-center justify-center rounded-lg text-[14px] font-semibold ${highlight ? "bg-mustard-400 text-char-900 hover:bg-mustard-500" : "border border-white/20 hover:bg-white/10"}`}>
                      Começar teste grátis
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3"><LogoMark size={28} /><span className="text-[13px] text-muted">© {new Date().getFullYear()} TOP BURGER OS</span></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-2">
            {support.whatsapp && <a href={`https://wa.me/55${support.whatsapp}`} target="_blank" rel="noreferrer" className="hover:text-ink">WhatsApp {fmtPhone(support.whatsapp)}</a>}
            {support.email && <a href={`mailto:${support.email}`} className="hover:text-ink">{support.email}</a>}
            {support.hours && <span className="text-muted">{support.hours}</span>}
            <Link href="/login" className="hover:text-ink">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
