"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Photo } from "@/components/ui/photo";
import { basePrice } from "@/lib/cart";
import { currentWeekday, nextOpenLabel, weeklyHours } from "@/lib/hours";
import { date, money, phone, time } from "@/lib/format";
import type { SfProduct, Storefront } from "@/lib/types";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";
import { useCart } from "./cart-context";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function PriceTag({ p, className }: { p: SfProduct; className?: string }) {
  const hasOptions = p.groups.some((g) => g.options.some((o) => Number(o.price_delta) > 0)) || p.type === "combo";
  return (
    <span className={cn("num flex items-baseline gap-1.5", className)}>
      {p.promo_price != null && <span className="text-[13px] text-muted line-through">{money(p.price)}</span>}
      <span className={cn("font-semibold", p.promo_price != null ? "text-pickle-700" : "text-ink")}>
        {hasOptions && p.type !== "combo" ? <span className="mr-1 text-xs font-normal text-muted">a partir de</span> : null}
        {money(basePrice(p))}
      </span>
    </span>
  );
}

function ProductRow({ p, onOpen, inCart }: { p: SfProduct; onOpen: () => void; inCart: number }) {
  return (
    <button type="button" onClick={onOpen} className={cn("group flex w-full gap-3 rounded-xl border border-transparent bg-surface p-3 text-left transition hover:border-line hover:shadow-card sm:p-3.5", !p.is_available && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold leading-snug">{p.name}</h3>
        {p.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{p.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PriceTag p={p} className="text-[15px]" />
          {!p.is_available && <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted">Esgotado</span>}
          {p.promo_price != null && p.is_available && <span className="rounded-sm bg-pickle-50 px-1.5 py-0.5 text-[11px] font-bold uppercase text-pickle-700">Promo</span>}
        </div>
      </div>
      <div className="relative shrink-0">
        <Photo src={p.images[0]} alt={p.name} sizes="(min-width: 640px) 128px, 104px" className="h-[104px] w-[104px] rounded-lg sm:h-32 sm:w-32" />
        {p.is_available && (
          <span className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-ink shadow-pop ring-2 ring-surface transition group-hover:scale-105">
            {inCart ? <span className="num text-[12px] font-bold">{inCart}</span> : <Icon name="plus" size={17} strokeWidth={2.4} />}
          </span>
        )}
      </div>
    </button>
  );
}

function FeaturedCard({ p, onOpen }: { p: SfProduct; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group w-[220px] shrink-0 snap-start overflow-hidden rounded-xl bg-surface text-left shadow-card ring-1 ring-line transition hover:shadow-pop sm:w-[250px]">
      <div className="relative">
        <Photo src={p.images[0]} alt={p.name} sizes="250px" rounded={false} className="aspect-[5/4] w-full" />
        {p.promo_price != null && <span className="absolute left-2 top-2 rounded-sm bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-ink">Promo</span>}
      </div>
      <div className="p-3">
        <p className="truncate text-[15px] font-semibold">{p.name}</p>
        <PriceTag p={p} className="mt-1 text-[14px]" />
      </div>
    </button>
  );
}

function InfoModal({ sf, open, onClose }: { sf: Storefront; open: boolean; onClose: () => void }) {
  const today = currentWeekday(sf.org.timezone);
  const a = sf.org.address;
  const addressText = [a.street && `${a.street}${a.number ? `, ${a.number}` : ""}`, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`].filter(Boolean).join(" · ");
  return (
    <Modal open={open} onClose={onClose} title={sf.org.name} description={sf.org.description ?? undefined}>
      <div className="space-y-5 text-[14px]">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Horários</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {weeklyHours(sf.hours).map((d) => (
              <li key={d.weekday} className={cn("flex justify-between px-3 py-2", d.weekday === today && "bg-brand-soft font-semibold")}>
                <span>{d.name}{d.weekday === today ? " (hoje)" : ""}</span>
                <span className={cn("num", d.closed && "text-muted")}>{d.label}</span>
              </li>
            ))}
          </ul>
          {sf.exceptions.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
              {sf.exceptions.map((e) => (
                <li key={e.date}>
                  <b>{date(e.date)}</b>: {e.is_closed ? "fechado" : `${e.opens_at} – ${e.closes_at}`}{e.reason ? ` (${e.reason})` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
        {addressText && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Endereço</h3>
            <p>{addressText}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline"><Icon name="map" size={14} /> Ver no mapa</a>
          </section>
        )}
        {sf.org.accepts_delivery && sf.zones.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Taxas de entrega</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {sf.zones.map((z) => (
                <li key={z.id} className="flex items-center justify-between px-3 py-2">
                  <span>{z.name}<span className="ml-2 text-xs text-muted">{z.eta_min}–{z.eta_max} min{Number(z.min_order) > 0 ? ` · mín. ${money(z.min_order)}` : ""}</span></span>
                  <span className="num font-medium">{Number(z.fee) === 0 ? "Grátis" : money(z.fee)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Pagamento</h3>
          <div className="flex flex-wrap gap-2">
            {sf.org.accepts_pix && <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5"><Icon name="pix" size={15} />Pix</span>}
            {sf.org.accepts_cash && <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5"><Icon name="cash" size={15} />Dinheiro</span>}
            {sf.org.accepts_card && <span className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5"><Icon name="card" size={15} />Cartão na entrega</span>}
          </div>
        </section>
        {(sf.org.phone || sf.org.instagram) && (
          <section className="flex flex-wrap gap-4 text-[13px]">
            {sf.org.phone && <a href={`tel:${sf.org.phone}`} className="flex items-center gap-1.5"><Icon name="phone" size={15} />{phone(sf.org.phone)}</a>}
            {sf.org.instagram && <a href={`https://instagram.com/${sf.org.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5"><Icon name="instagram" size={15} />@{sf.org.instagram.replace("@", "")}</a>}
          </section>
        )}
      </div>
    </Modal>
  );
}

export function StoreMenu({ initialProductId }: { initialProductId?: string }) {
  const { sf, cart, openProduct, setDrawerOpen, count } = useCart();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState<string | null>(sf.categories[0]?.id ?? null);
  const [info, setInfo] = useState(false);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const nav = useRef<HTMLDivElement>(null);
  const clickScrolling = useRef(false);

  useEffect(() => {
    if (!initialProductId) return;
    const p = sf.products.find((x) => x.id === initialProductId);
    if (p) openProduct(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);

  // Scroll-spy das categorias
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (clickScrolling.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.getAttribute("data-cat"));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    Object.values(sections.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [sf.categories]);

  useEffect(() => {
    if (!active || !nav.current) return;
    const chip = nav.current.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const goTo = (id: string) => {
    setActive(id);
    clickScrolling.current = true;
    const el = sections.current[id];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 112, behavior: "smooth" });
    setTimeout(() => (clickScrolling.current = false), 700);
  };

  const qtyInCart = (id: string) => cart.items.filter((i) => i.product_id === id).reduce((a, i) => a + i.quantity, 0);
  const featured = sf.products.filter((p) => (p.is_featured || p.promo_price != null) && p.is_available).slice(0, 10);
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return sf.products.filter((p) => norm(`${p.name} ${p.description ?? ""} ${p.ingredients ?? ""}`).includes(q));
  }, [query, sf.products]);

  const etaMin = sf.zones.length ? Math.min(...sf.zones.map((z) => z.eta_min)) : sf.org.pickup_eta_min;
  const etaMax = sf.zones.length ? Math.max(...sf.zones.map((z) => z.eta_max)) : sf.org.pickup_eta_max;
  const minFee = sf.zones.length ? Math.min(...sf.zones.map((z) => Number(z.fee))) : null;
  const status = sf.status;

  return (
    <div>
      {/* Banner */}
      <div className="relative mx-auto max-w-[1180px] md:px-6 md:pt-4">
        <div className="relative overflow-hidden bg-brand-2 md:rounded-2xl">
          {sf.org.banner_url ? (
            <Photo src={sf.org.banner_url} alt="" sizes="(min-width: 1180px) 1132px, 100vw" priority rounded={false} className="aspect-[16/8] w-full sm:aspect-[16/6] md:max-h-[340px]" />
          ) : (
            <div className="grain aspect-[16/8] w-full bg-brand-2 sm:aspect-[16/5]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        {/* Identidade */}
        <div className="relative -mt-10 flex items-end gap-4 sm:-mt-12">
          <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-2xl bg-surface shadow-pop ring-4 ring-paper sm:h-[104px] sm:w-[104px]">
            <Photo src={sf.org.logo_url} alt={`Logo ${sf.org.name}`} sizes="104px" priority rounded={false} className="h-full w-full" />
          </div>
          <div className="mb-1 flex flex-1 flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setInfo(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold shadow-card">
              <Icon name="info" size={15} /> Informações
            </button>
            {sf.org.instagram && (
              <a href={`https://instagram.com/${sf.org.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface shadow-card"><Icon name="instagram" size={16} /></a>
            )}
            {sf.org.whatsapp && (
              <a href={waLink(sf.org.whatsapp, `Olá, ${sf.org.name}!`)} target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-pickle-700 shadow-card"><Icon name="whatsapp" size={16} /></a>
            )}
          </div>
        </div>

        <h1 className="mt-3 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[36px]">{sf.org.name}</h1>
        {sf.org.description && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">{sf.org.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", status.is_open ? "bg-pickle-50 text-pickle-700" : "bg-ketchup-50 text-ketchup-700")}>
            <span className={cn("h-2 w-2 rounded-full", status.is_open ? "bg-pickle-500" : "bg-ketchup-500")} />
            {status.is_open ? (status.closes_at ? `Aberto · fecha às ${time(status.closes_at, sf.org.timezone)}` : "Aberto agora") : "Fechado"}
          </span>
          {sf.org.accepts_delivery && <span className="flex items-center gap-1.5 text-ink-2"><Icon name="clock" size={15} className="text-muted" /><span className="num">{etaMin}–{etaMax} min</span></span>}
          {sf.org.accepts_delivery && minFee != null && <span className="flex items-center gap-1.5 text-ink-2"><Icon name="bike" size={15} className="text-muted" />Entrega {minFee === 0 ? "grátis" : <span className="num">a partir de {money(minFee)}</span>}</span>}
          {Number(sf.org.min_order_value) > 0 && <span className="flex items-center gap-1.5 text-ink-2"><Icon name="bag" size={15} className="text-muted" />Pedido mín. <span className="num">{money(sf.org.min_order_value)}</span></span>}
          {sf.rating && (
            <span className="flex items-center gap-1 text-ink-2">
              <Icon name="star" size={15} className="fill-mustard-400 text-mustard-500" />
              <b className="num">{Number(sf.rating.avg).toFixed(1).replace(".", ",")}</b>
              <span className="text-muted">({sf.rating.count} {sf.rating.count === 1 ? "avaliação" : "avaliações"})</span>
            </span>
          )}
        </div>

        {cart.table && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-brand-soft px-4 py-3">
            <Icon name="table" size={20} />
            <p className="text-[14px]"><b>Você está na {cart.table.label}.</b> Seus pedidos vão direto para a cozinha e entram na conta da mesa.</p>
          </div>
        )}

        {!status.is_open && (
          <div className="mt-4 rounded-xl border border-ketchup-100 bg-ketchup-50 px-4 py-3">
            <p className="font-semibold text-ketchup-700">{status.message ?? "Estamos fechados no momento."}</p>
            <p className="mt-0.5 text-[13px] text-ketchup-700/90">
              {nextOpenLabel(status.next_open_at, sf.org.timezone) ?? "Confira os horários em Informações."}
              {sf.org.allow_scheduling && " · Você já pode agendar seu pedido para mais tarde."}
            </p>
          </div>
        )}
      </div>

      {/* Navegação de categorias */}
      <div className="sticky top-0 z-30 mt-5 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-2.5 md:px-6">
          {searchOpen ? (
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Icon name="search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no cardápio" className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-3 text-[15px] focus:border-brand focus:outline-none" />
              </div>
              <button type="button" onClick={() => { setSearchOpen(false); setQuery(""); }} className="h-10 px-2 text-[14px] font-semibold">Cancelar</button>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface"><Icon name="search" size={17} /></button>
              <div ref={nav} className="scroll-x flex flex-1 gap-1.5">
                {sf.categories.map((c) => (
                  <button key={c.id} type="button" data-chip={c.id} onClick={() => goTo(c.id)} className={cn("h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors", active === c.id ? "bg-brand-2 text-brand-2-ink" : "bg-surface text-ink-2 ring-1 ring-line hover:ring-line-strong")}>
                    {c.name}
                  </button>
                ))}
              </div>
              {count > 0 && (
                <button type="button" onClick={() => setDrawerOpen(true)} className="hidden h-10 shrink-0 items-center gap-2 rounded-full bg-brand px-4 text-[14px] font-bold text-brand-ink md:flex">
                  <Icon name="bag" size={16} /> {count}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5 md:px-6">
        {query.trim() ? (
          <section>
            <p className="mb-3 text-[13px] text-muted">{results.length} resultado(s) para “{query}”</p>
            <div className="grid gap-2 md:grid-cols-2">
              {results.map((p) => <ProductRow key={p.id} p={p} inCart={qtyInCart(p.id)} onOpen={() => openProduct(p)} />)}
            </div>
            {results.length === 0 && <p className="py-12 text-center text-[14px] text-muted">Nada encontrado. Tente outro nome.</p>}
          </section>
        ) : (
          <>
            {featured.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-display text-[20px] font-bold tracking-[-0.01em]">Destaques da casa</h2>
                <div className="scroll-x -mx-4 flex snap-x gap-3 px-4 pb-2 md:-mx-6 md:px-6">
                  {featured.map((p) => <FeaturedCard key={p.id} p={p} onOpen={() => openProduct(p)} />)}
                </div>
              </section>
            )}
            {sf.categories.map((c) => {
              const list = sf.products.filter((p) => p.category_id === c.id);
              if (!list.length) return null;
              return (
                <section key={c.id} data-cat={c.id} ref={(el) => { sections.current[c.id] = el; }} className="mb-8 scroll-mt-28">
                  <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">{c.name}</h2>
                  {c.description && <p className="mt-0.5 text-[13px] text-muted">{c.description}</p>}
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {list.map((p) => <ProductRow key={p.id} p={p} inCart={qtyInCart(p.id)} onOpen={() => openProduct(p)} />)}
                  </div>
                </section>
              );
            })}
            {sf.products.length === 0 && <p className="py-16 text-center text-muted">Nenhum produto disponível no cardápio agora.</p>}
          </>
        )}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-6 text-[13px] text-muted md:flex-row md:items-center md:justify-between md:px-6">
          <span>{sf.org.name}{sf.org.address.city ? ` · ${sf.org.address.city}` : ""}</span>
          <span>Pedidos online com <b className="text-ink-2">TOP BURGER OS</b></span>
        </div>
      </footer>

      <InfoModal sf={sf} open={info} onClose={() => setInfo(false)} />
    </div>
  );
}
