"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCart } from "@/components/storefront/cart-context";
import { MoneyInput } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { describeItem, toPayloadItem } from "@/lib/cart";
import { maskCep, maskPhone, money, onlyDigits } from "@/lib/format";
import { schedulingSlots } from "@/lib/hours";
import { loadProfile, lookupCep, rpcPlaceOrder, rpcQuote, saveProfile, type LocalProfile } from "@/lib/storefront-client";
import type { OrderType, PaymentMethod, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function Block({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="border-b-8 border-sunken bg-surface px-4 py-5 sm:px-6">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-[18px] font-bold">
        <span className={cn("num grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold", done ? "bg-pickle-500 text-white" : "bg-ink text-white")}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({ active, onClick, icon, title, hint, disabled }: { active: boolean; onClick: () => void; icon: IconName; title: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active} className={cn("flex min-h-[64px] flex-1 items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition disabled:opacity-40", active ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong")}>
      <Icon name={icon} size={20} className={active ? "text-ink" : "text-muted"} />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{title}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}

const field = "h-12 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-[16px] placeholder:text-faint focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20";

export default function CheckoutPage() {
  const { sf, cart, ready, clear, setCoupon } = useCart();
  const router = useRouter();
  const toast = useToast();
  const slug = sf.org.slug;
  const types = useMemo(() => {
    const list: { value: OrderType; title: string; hint: string; icon: IconName }[] = [];
    if (sf.org.accepts_delivery) list.push({ value: "delivery", title: "Entrega", hint: "No seu endereço", icon: "bike" });
    if (sf.org.accepts_pickup) list.push({ value: "pickup", title: "Retirada", hint: `Pronto em ${sf.org.pickup_eta_min}–${sf.org.pickup_eta_max} min`, icon: "bag" });
    if (sf.org.accepts_dine_in) list.push({ value: "dine_in", title: "Comer no local", hint: "Na loja", icon: "utensils" });
    return list;
  }, [sf.org]);

  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<OrderType>(cart.table ? "dine_in" : types[0]?.value ?? "pickup");
  const [addr, setAddr] = useState({ zip: "", street: "", number: "", district: "", complement: "", reference: "", city: sf.org.address.city ?? "" });
  const [zoneId, setZoneId] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [when, setWhen] = useState<"now" | "later">(sf.status.is_open ? "now" : "later");
  const [slot, setSlot] = useState("");
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [needChange, setNeedChange] = useState<boolean | null>(null);
  const [changeFor, setChangeFor] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [coupon, setCouponInput] = useState(cart.coupon_code ?? "");
  const [remember, setRemember] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const placed = useRef(false);

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setProfile(p);
      setName(p.name);
      setPhone(maskPhone(p.phone));
      if (p.addresses[0]) setAddr({ ...p.addresses[0], city: p.addresses[0].city || sf.org.address.city || "" });
    }
  }, [sf.org.address.city]);

  useEffect(() => {
    if (cart.table) setType("dine_in");
  }, [cart.table]);

  // Zona automática por CEP ou nome do bairro
  useEffect(() => {
    if (type !== "delivery") return;
    const zip = onlyDigits(addr.zip);
    const byZip = zip.length >= 5 ? sf.zones.find((z) => z.zip_prefixes.some((p) => zip.startsWith(onlyDigits(p)))) : undefined;
    const byName = addr.district ? sf.zones.find((z) => norm(z.name) === norm(addr.district)) : undefined;
    const match = byZip ?? byName;
    if (match) setZoneId(match.id);
  }, [addr.zip, addr.district, type, sf.zones]);

  const slots = useMemo(() => (sf.org.allow_scheduling ? schedulingSlots(sf.hours, sf.exceptions, sf.org.timezone) : []), [sf]);
  const scheduledFor = when === "later" ? slot : "";

  const payload = useMemo(
    () => ({
      type,
      items: cart.items.map(toPayloadItem),
      customer: { name: name.trim(), phone: onlyDigits(phone) },
      address: type === "delivery" ? { ...addr, zip: onlyDigits(addr.zip) } : undefined,
      zone_id: type === "delivery" ? zoneId || null : null,
      coupon_code: coupon.trim() || undefined,
      payment_method: payment,
      change_for: payment === "cash" && needChange ? changeFor : null,
      notes: notes.trim() || undefined,
      scheduled_for: scheduledFor || undefined,
      table_token: cart.table?.token,
    }),
    [type, cart.items, cart.table, name, phone, addr, zoneId, coupon, payment, needChange, changeFor, notes, scheduledFor],
  );

  // Cotação oficial no servidor (preços, taxa, cupom)
  useEffect(() => {
    if (!cart.items.length) return;
    setQuoting(true);
    const t = setTimeout(async () => {
      const { data, error } = await rpcQuote(slug, { ...payload, payment_method: undefined, change_for: undefined });
      setQuoting(false);
      setQuote(data);
      setQuoteErr(error);
    }, 300);
    return () => clearTimeout(t);
  }, [payload, slug, cart.items.length]);

  useEffect(() => {
    if (ready && !cart.items.length && !placed.current) router.replace(`/${slug}`);
  }, [ready, cart.items.length, router, slug]);

  const total = quote?.total ?? 0;
  const zone = sf.zones.find((z) => z.id === zoneId);
  const phoneOk = onlyDigits(phone).length >= 10;
  const blocked = !sf.status.is_open && !sf.org.allow_scheduling;
  const problems: string[] = [];
  if (name.trim().length < 2) problems.push("Informe seu nome");
  if (!phoneOk && !cart.table) problems.push("Informe um telefone com DDD");
  if (type === "delivery") {
    if (!addr.street.trim() || !addr.number.trim() || !addr.district.trim()) problems.push("Complete o endereço de entrega");
    if (!zoneId) problems.push("Selecione o bairro de entrega");
  }
  if (when === "later" && !slot) problems.push("Escolha o horário do agendamento");
  if (!payment) problems.push("Escolha a forma de pagamento");
  if (payment === "cash" && needChange == null) problems.push("Informe se precisa de troco");
  if (payment === "cash" && needChange && (!changeFor || changeFor < total)) problems.push("O troco deve ser para um valor maior que o total");
  if (quote?.below_minimum) problems.push(`Pedido mínimo de ${money(quote.min_order)}`);
  if (quoteErr) problems.push(quoteErr);
  if (blocked) problems.push(sf.status.message ?? "Estamos fechados no momento");

  const confirm = async () => {
    setAttempted(true);
    setSubmitError(null);
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setSubmitting(true);
    const { data, error } = await rpcPlaceOrder(slug, payload);
    if (error || !data) {
      setSubmitting(false);
      setSubmitError(error ?? "Não foi possível enviar o pedido");
      toast.error("Pedido não enviado", error ?? undefined);
      return;
    }
    placed.current = true;
    if (remember) {
      const addresses = type === "delivery" ? [{ ...addr, zip: onlyDigits(addr.zip) }, ...(profile?.addresses ?? []).filter((a) => !(a.street === addr.street && a.number === addr.number))] : profile?.addresses ?? [];
      saveProfile({ name: name.trim(), phone: onlyDigits(phone), addresses });
    }
    setCoupon(null);
    clear();
    router.push(`/${slug}/pedido/${data.token}?novo=1`);
  };

  if (!ready || !cart.items.length) {
    return <div className="grid min-h-[60dvh] place-items-center"><Spinner size={24} className="text-muted" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1100px] md:px-6 md:py-6">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:rounded-t-2xl md:border md:border-b-0">
        <Link href={`/${slug}/carrinho`} aria-label="Voltar ao carrinho" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sunken"><Icon name="arrow-left" size={18} /></Link>
        <div>
          <h1 className="font-display text-lg font-bold leading-tight">Finalizar pedido</h1>
          <p className="text-xs text-muted">{sf.org.name}</p>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-6">
        <div className="md:overflow-hidden md:rounded-b-2xl md:border md:border-t-0 md:border-line">
          <Block n={1} title="Seus dados" done={name.trim().length >= 2 && (phoneOk || Boolean(cart.table))}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Nome</span>
                <input className={cn(field, attempted && name.trim().length < 2 && "border-ketchup-500")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como podemos te chamar?" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Celular (WhatsApp){cart.table ? " — opcional" : ""}</span>
                <input className={cn(field, attempted && !phoneOk && !cart.table && "border-ketchup-500")} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(71) 99999-0000" />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">Sem cadastro e sem senha. Usamos o telefone só para falar sobre este pedido.</p>
          </Block>

          <Block n={2} title="Como você quer receber?">
            {cart.table ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-brand bg-brand-soft px-4 py-3">
                <Icon name="table" size={20} />
                <div><p className="font-semibold">Consumo no local · {cart.table.label}</p><p className="text-xs text-muted">Identificado pelo QR Code da mesa</p></div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                {types.map((t) => <Choice key={t.value} active={type === t.value} onClick={() => setType(t.value)} icon={t.icon} title={t.title} hint={t.hint} />)}
              </div>
            )}

            {type === "delivery" && !cart.table && (
              <div className="mt-5 space-y-3">
                {profile && profile.addresses.length > 0 && (
                  <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
                    {profile.addresses.map((a, i) => (
                      <button key={i} type="button" onClick={() => setAddr({ ...a, city: a.city || sf.org.address.city || "" })} className={cn("shrink-0 rounded-lg border px-3 py-2 text-left text-[13px]", addr.street === a.street && addr.number === a.number ? "border-brand bg-brand-soft" : "border-line")}>
                        <span className="block font-semibold">{a.street}, {a.number}</span>
                        <span className="block text-xs text-muted">{a.district}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">CEP</span>
                    <div className="relative">
                      <input
                        className={field}
                        inputMode="numeric"
                        value={addr.zip}
                        onChange={async (e) => {
                          const v = maskCep(e.target.value);
                          setAddr((a) => ({ ...a, zip: v }));
                          if (onlyDigits(v).length === 8) {
                            setCepLoading(true);
                            const r = await lookupCep(v);
                            setCepLoading(false);
                            if (r) setAddr((a) => ({ ...a, street: r.street || a.street, district: r.district || a.district, city: r.city || a.city }));
                          }
                        }}
                        placeholder="00000-000"
                      />
                      {cepLoading && <Spinner size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />}
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Rua</span>
                    <input className={cn(field, attempted && !addr.street.trim() && "border-ketchup-500")} autoComplete="address-line1" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
                  </label>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Número</span>
                    <input className={cn(field, attempted && !addr.number.trim() && "border-ketchup-500")} value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Bairro</span>
                    <input className={cn(field, attempted && !addr.district.trim() && "border-ketchup-500")} value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Complemento</span>
                    <input className={field} value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} placeholder="Apto, bloco, casa…" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Ponto de referência</span>
                    <input className={field} value={addr.reference} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} placeholder="Ex.: portão azul" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Área de entrega</span>
                  <select className={cn(field, "appearance-none", attempted && !zoneId && "border-ketchup-500")} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                    <option value="">Selecione seu bairro</option>
                    {sf.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {Number(z.fee) === 0 ? "grátis" : money(z.fee)} · {z.eta_min}–{z.eta_max} min</option>)}
                  </select>
                  {sf.zones.length === 0 && <span className="mt-1 block text-xs text-ketchup-500">A loja ainda não cadastrou áreas de entrega. Escolha retirada.</span>}
                </label>
                {zone && (
                  <div className="flex items-start gap-3 rounded-xl bg-paper p-3.5 text-[14px]">
                    <Icon name="map-pin" size={18} className="mt-0.5 text-muted" />
                    <div className="flex-1">
                      <p className="text-xs text-muted">Entrega para</p>
                      <p className="font-semibold">{addr.street || "—"}{addr.number ? `, nº ${addr.number}` : ""}</p>
                      <p className="mt-1 flex gap-4 text-[13px] text-ink-2"><span>Taxa: <b className="num">{Number(zone.fee) === 0 ? "grátis" : money(zone.fee)}</b></span><span>Previsão: <b className="num">{zone.eta_min}–{zone.eta_max} min</b></span></p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {type === "pickup" && (
              <div className="mt-4 flex items-start gap-3 rounded-xl bg-paper p-3.5 text-[14px]">
                <Icon name="store" size={18} className="mt-0.5 text-muted" />
                <div>
                  <p className="font-semibold">Retirada no estabelecimento</p>
                  <p className="text-ink-2">{[sf.org.address.street && `${sf.org.address.street}, ${sf.org.address.number ?? ""}`, sf.org.address.district, sf.org.address.city].filter(Boolean).join(" · ") || sf.org.name}</p>
                  <p className="mt-1 text-[13px] text-muted">Tempo estimado: <b className="num">{sf.org.pickup_eta_min}–{sf.org.pickup_eta_max} min</b> · sem taxa de entrega</p>
                </div>
              </div>
            )}
            {type === "dine_in" && !cart.table && <p className="mt-3 text-[13px] text-muted">Faça o pedido e retire no balcão. Sem taxa de entrega.</p>}

            {!cart.table && (sf.org.allow_scheduling || !sf.status.is_open) && (
              <div className="mt-5">
                <p className="mb-2 text-[13px] font-semibold text-ink-2">Quando?</p>
                <div className="flex gap-2">
                  <Choice active={when === "now"} disabled={!sf.status.is_open} onClick={() => setWhen("now")} icon="clock" title="Agora" hint={sf.status.is_open ? "O quanto antes" : "Loja fechada"} />
                  {sf.org.allow_scheduling && <Choice active={when === "later"} onClick={() => setWhen("later")} icon="calendar" title="Agendar" hint="Escolha o horário" />}
                </div>
                {when === "later" && (
                  <select className={cn(field, "mt-3 appearance-none", attempted && !slot && "border-ketchup-500")} value={slot} onChange={(e) => setSlot(e.target.value)}>
                    <option value="">{slots.length ? "Escolha um horário" : "Sem horários disponíveis nos próximos dias"}</option>
                    {slots.map((s) => <option key={s.value} value={s.value}>{s.day} · {s.label}</option>)}
                  </select>
                )}
              </div>
            )}
          </Block>

          <Block n={3} title="Pagamento" done={Boolean(payment)}>
            <p className="mb-3 text-[13px] text-muted">{type === "delivery" ? "Pague na entrega ou via Pix." : "Pague na retirada ou via Pix."}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {sf.org.accepts_pix && <Choice active={payment === "pix"} onClick={() => setPayment("pix")} icon="pix" title="Pix" hint="Chave após confirmar" />}
              {sf.org.accepts_cash && <Choice active={payment === "cash"} onClick={() => setPayment("cash")} icon="cash" title="Dinheiro" />}
              {sf.org.accepts_card && <Choice active={payment === "card"} onClick={() => setPayment("card")} icon="card" title={type === "delivery" ? "Cartão na entrega" : "Cartão"} hint="Débito ou crédito" />}
            </div>
            {payment === "cash" && (
              <div className="mt-4 rounded-xl bg-paper p-4">
                <p className="text-[14px] font-semibold">Precisa de troco?</p>
                <div className="mt-2 flex gap-2">
                  {[true, false].map((v) => (
                    <button key={String(v)} type="button" onClick={() => setNeedChange(v)} className={cn("h-10 flex-1 rounded-lg border-2 text-[14px] font-semibold", needChange === v ? "border-brand bg-brand-soft" : "border-line bg-surface")}>{v ? "Sim" : "Não"}</button>
                  ))}
                </div>
                {needChange && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink-2">Troco para quanto?</label>
                    <MoneyInput value={changeFor} onChange={setChangeFor} className="h-12 text-[16px]" />
                    {changeFor != null && total > 0 && (
                      <p className={cn("mt-2 text-[14px]", changeFor >= total ? "text-pickle-700" : "text-ketchup-500")}>
                        {changeFor >= total ? <>Pedido {money(total)} · troco de <b className="num">{money(changeFor - total)}</b></> : "O valor precisa ser maior que o total"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {payment === "pix" && <p className="mt-3 rounded-lg bg-paper px-3 py-2.5 text-[13px] text-ink-2">Depois de confirmar, mostramos o Pix copia-e-cola para você pagar no app do banco.</p>}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Cupom</span>
                <input className={cn(field, "font-mono uppercase")} value={coupon} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Opcional" />
                {quote?.coupon_error && coupon && <span className="mt-1 block text-xs text-ketchup-500">{quote.coupon_error}</span>}
                {quote?.coupon && <span className="mt-1 block text-xs text-pickle-700">Cupom {quote.coupon.code} aplicado</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Observação geral</span>
                <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: interfone quebrado" maxLength={500} />
              </label>
            </div>
          </Block>
        </div>

        {/* Resumo */}
        <aside className="md:sticky md:top-6 md:self-start">
          <div className="bg-surface px-4 py-5 sm:px-6 md:rounded-2xl md:border md:border-line md:shadow-card">
            <h2 className="mb-3 font-display text-[18px] font-bold">Seu pedido</h2>
            <ul className="space-y-2.5">
              {cart.items.map((it) => (
                <li key={it.key} className="flex gap-2 text-[14px]">
                  <span className="num font-semibold">{it.quantity}x</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{it.name}</span>
                    {(it.options.length > 0 || it.combo.length > 0) && <span className="block text-xs text-muted">{describeItem(it)}</span>}
                  </span>
                  <span className="num">{money(it.unit_price * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="rule-dashed my-4" />
            <dl className="space-y-1.5 text-[14px]">
              <div className="flex items-start gap-2 text-ink-2">
                <Icon name={type === "delivery" ? "bike" : type === "pickup" ? "bag" : "utensils"} size={16} className="mt-0.5 text-muted" />
                <span className="flex-1">
                  {type === "delivery" ? (addr.street ? `${addr.street}, ${addr.number} · ${addr.district}` : "Entrega — informe o endereço") : type === "pickup" ? "Retirada no estabelecimento" : cart.table ? cart.table.label : "Consumo no local"}
                  {when === "later" && slot && <span className="block text-xs text-mustard-700">Agendado: {slots.find((s) => s.value === slot)?.day} {slots.find((s) => s.value === slot)?.label}</span>}
                </span>
              </div>
              {payment && <div className="flex items-center gap-2 text-ink-2"><Icon name={payment === "pix" ? "pix" : payment === "cash" ? "cash" : "card"} size={16} className="text-muted" />{payment === "pix" ? "Pix" : payment === "cash" ? `Dinheiro${needChange && changeFor ? ` · troco p/ ${money(changeFor)}` : ""}` : "Cartão"}</div>}
            </dl>
            <div className="rule-dashed my-4" />
            <dl className="space-y-1 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted">Produtos</dt><dd className="num">{money(quote?.subtotal ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd className="num">{type === "delivery" ? (quote?.zone ? (Number(quote.delivery_fee) === 0 ? "Grátis" : money(quote.delivery_fee)) : "—") : "Grátis"}</dd></div>
              {Number(quote?.discount ?? 0) > 0 && <div className="flex justify-between text-pickle-700"><dt>Desconto</dt><dd className="num">− {money(quote?.discount)}</dd></div>}
              <div className="flex items-center justify-between border-t border-line pt-2 font-display text-[22px] font-extrabold">
                <dt>Total</dt>
                <dd className="num flex items-center gap-2">{quoting && <Spinner size={14} className="text-muted" />}{money(total)}</dd>
              </div>
            </dl>
            {quote?.below_minimum && <p className="mt-2 rounded-md bg-mustard-50 px-3 py-2 text-[13px] text-mustard-700">Pedido mínimo para esta área: {money(quote.min_order)}</p>}
            {(submitError || (attempted && problems.length > 0)) && (
              <div className="mt-3 rounded-md bg-ketchup-50 px-3 py-2 text-[13px] text-ketchup-700">
                {submitError ?? problems[0]}
                {submitError && /disponível|esgotado|opç/i.test(submitError) && <Link href={`/${slug}/carrinho`} className="ml-1 font-semibold underline">Revisar carrinho</Link>}
              </div>
            )}
            <label className="mt-4 flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Lembrar meus dados neste aparelho
            </label>
            <button type="button" onClick={confirm} disabled={submitting || blocked} className="safe-bottom mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[16px] font-extrabold uppercase tracking-wide text-brand-ink shadow-pop transition active:scale-[0.99] disabled:opacity-50">
              {submitting ? <><Spinner size={18} /> Enviando…</> : <>Confirmar pedido · <span className="num">{money(total)}</span></>}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted">Valores conferidos pela loja no momento do envio.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
