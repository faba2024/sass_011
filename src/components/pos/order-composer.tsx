"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createStaffOrderAction, lookupCustomerAction, quoteStaffOrderAction } from "@/app/app/(shell)/pedidos/novo/actions";
import { ProductCustomizer } from "@/components/storefront/product-customizer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Photo } from "@/components/ui/photo";
import { Sheet } from "@/components/ui/sheet";
import { Notice } from "@/components/ui/states";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { basePrice, describeItem, toPayloadItem, type CartItem } from "@/lib/cart";
import { PAYMENT_METHOD } from "@/lib/constants";
import { maskCep, maskPhone, money, onlyDigits } from "@/lib/format";
import type { OrderType, PaymentMethod, Quote, SfProduct, Storefront } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function OrderComposer({ sf, tables, mode, onCreated }: { sf: Storefront; tables: { id: string; label: string }[]; mode: "pdv" | "admin"; onCreated?: (o: { id: string; number: number; total: number }) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [customizing, setCustomizing] = useState<{ product: SfProduct; item: CartItem | null } | null>(null);
  const [type, setType] = useState<OrderType>(mode === "pdv" ? "counter" : "delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({ zip: "", street: "", number: "", district: "", complement: "", reference: "" });
  const [zoneId, setZoneId] = useState("");
  const [tableId, setTableId] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [received, setReceived] = useState<number | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [coupon, setCoupon] = useState("");
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(mode === "pdv");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [known, setKnown] = useState<NonNullable<Awaited<ReturnType<typeof lookupCustomerAction>>["data"]> | null>(null);

  const products = useMemo(() => {
    const q = norm(search.trim());
    return sf.products.filter((p) => (category === "all" || p.category_id === category) && (!q || norm(p.name).includes(q)));
  }, [sf.products, search, category]);

  const payloadBase = useMemo(
    () => ({
      type,
      items: items.map(toPayloadItem),
      customer: { name, phone },
      address: type === "delivery" ? address : undefined,
      zone_id: type === "delivery" ? zoneId || null : null,
      table_id: type === "dine_in" ? tableId || null : null,
      coupon_code: coupon.trim() || undefined,
      payment_method: payment as "pix" | "cash" | "card",
      notes: notes || undefined,
    }),
    [type, items, name, phone, address, zoneId, tableId, coupon, payment, notes],
  );

  // Cotação no servidor (preço oficial)
  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const t = setTimeout(async () => {
      const res = await quoteStaffOrderAction(payloadBase);
      if (res.ok) {
        setQuote(res.data ?? null);
        setQuoteError(null);
      } else setQuoteError(res.error ?? "Erro ao calcular");
    }, 350);
    return () => clearTimeout(t);
  }, [payloadBase, items.length]);

  // Cliente recorrente pelo telefone
  useEffect(() => {
    const d = onlyDigits(phone);
    if (d.length < 10) return setKnown(null);
    const t = setTimeout(async () => {
      const res = await lookupCustomerAction(d);
      if (res.ok && res.data) {
        setKnown(res.data);
        setName((n) => n || res.data!.name);
      } else setKnown(null);
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  const add = (p: SfProduct) => {
    if (!p.is_available) return toast.error(`${p.name} está esgotado`);
    if (p.groups.length || p.combo_groups.length) return setCustomizing({ product: p, item: null });
    setItems((list) => {
      const existing = list.find((i) => i.product_id === p.id && !i.options.length && !i.combo.length && !i.notes);
      if (existing) return list.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      return [...list, { key: uid(), product_id: p.id, name: p.name, image: p.images[0] ?? null, quantity: 1, notes: "", options: [], combo: [], unit_price: basePrice(p) }];
    });
  };

  const subtotalPreview = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
  const manual = Math.min(discount ?? 0, quote ? quote.subtotal + quote.delivery_fee - quote.discount : subtotalPreview);
  const total = Math.max(0, (quote ? quote.total : subtotalPreview) - manual);
  const change = payment === "cash" && received ? received - total : null;

  const reset = () => {
    setItems([]);
    setName("");
    setPhone("");
    setAddress({ zip: "", street: "", number: "", district: "", complement: "", reference: "" });
    setZoneId("");
    setTableId("");
    setReceived(null);
    setDiscount(null);
    setCoupon("");
    setNotes("");
    setTicketOpen(false);
  };

  const submit = async () => {
    if (!items.length) return toast.error("Adicione produtos ao pedido");
    if (type === "delivery" && (!zoneId || !address.street || !address.number || !address.district)) return toast.error("Preencha o endereço e o bairro de entrega");
    if (change != null && change < 0) return toast.error("Valor recebido menor que o total");
    setSaving(true);
    const res = await createStaffOrderAction({
      ...payloadBase,
      source: mode,
      manual_discount: manual || undefined,
      change_for: payment === "cash" && received ? received : null,
      paid: mode === "pdv" ? true : paid,
    });
    setSaving(false);
    if (!res.ok || !res.data) return toast.error(res.error ?? "Não foi possível lançar o pedido");
    toast.success(`Pedido #${res.data.number} lançado`, change && change > 0 ? `Troco: ${money(change)}` : undefined);
    onCreated?.(res.data);
    if (mode === "admin") router.push(`/app/pedidos/${res.data.id}`);
    else {
      reset();
      router.refresh();
    }
  };

  const typeOptions = ([
    { value: "counter", label: "Balcão", show: mode === "pdv" },
    { value: "pickup", label: "Retirada", show: true },
    { value: "delivery", label: "Entrega", show: true },
    { value: "dine_in", label: "Mesa", show: true },
  ] as const).filter((t) => t.show).map(({ value, label }) => ({ value: value as OrderType, label }));

  const ticket = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <Segmented value={type} onChange={setType} items={typeOptions} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
      </div>
      <div className="thin-scroll flex-1 space-y-4 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed border-line-strong py-10 text-center text-[13px] text-muted">
            <Icon name="burger" size={22} className="mb-2 text-faint" />
            Toque nos produtos para montar o pedido
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {items.map((it) => (
              <li key={it.key} className="flex gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{it.name}</p>
                  {(it.options.length > 0 || it.combo.length > 0) && <p className="text-xs text-muted">{describeItem(it)}</p>}
                  {it.notes && <p className="text-xs text-mustard-700">Obs.: {it.notes}</p>}
                  <div className="mt-1.5 flex items-center gap-1">
                    <button type="button" aria-label="Diminuir" onClick={() => setItems((l) => l.flatMap((x) => (x.key === it.key ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x])))} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:bg-sunken"><Icon name="minus" size={14} /></button>
                    <span className="num w-6 text-center text-[13px] font-semibold">{it.quantity}</span>
                    <button type="button" aria-label="Aumentar" onClick={() => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, quantity: Math.min(99, x.quantity + 1) } : x)))} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:bg-sunken"><Icon name="plus" size={14} /></button>
                    {(it.options.length > 0 || it.combo.length > 0) && (
                      <button type="button" onClick={() => { const p = sf.products.find((x) => x.id === it.product_id); if (p) setCustomizing({ product: p, item: it }); }} className="ml-1 rounded-md px-1.5 py-1 text-xs text-ink-2 hover:bg-sunken">Editar</button>
                    )}
                    <button type="button" onClick={() => setItems((l) => [...l, { ...it, key: uid() }])} className="rounded-md px-1.5 py-1 text-xs text-ink-2 hover:bg-sunken">Duplicar</button>
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="rounded-md px-1.5 py-1 text-xs text-ketchup-500 hover:bg-ketchup-50">Remover</button>
                  </div>
                </div>
                <span className="num text-[13px] font-semibold">{money(it.unit_price * it.quantity)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefone" help={known ? `Cliente: ${known.orders_count} pedido(s)` : undefined}>
            <Input inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(71) 99999-0000" />
          </Field>
          <Field label="Nome do cliente" required={type !== "counter"}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "counter" ? "Opcional" : ""} />
          </Field>
        </div>

        {type === "dine_in" && (
          <Field label="Mesa">
            <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Sem mesa (consumo no balcão)</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
        )}

        {type === "delivery" && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
            {known && known.customer_addresses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {known.customer_addresses.map((a) => (
                  <button key={a.id} type="button" onClick={() => setAddress({ zip: a.zip ?? "", street: a.street, number: a.number, district: a.district, complement: a.complement ?? "", reference: a.reference ?? "" })} className="rounded-md border border-line bg-surface px-2 py-1 text-left text-xs hover:border-ember-400">
                    {a.street}, {a.number} · {a.district}
                  </button>
                ))}
              </div>
            )}
            <Field label="Bairro / área de entrega" required>
              <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Selecione…</option>
                {sf.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {money(z.fee)}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Input placeholder="Rua" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
              <Input placeholder="Nº" value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Bairro" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} />
              <Input placeholder="CEP" inputMode="numeric" value={address.zip} onChange={(e) => setAddress({ ...address, zip: maskCep(e.target.value) })} />
            </div>
            <Input placeholder="Complemento / referência" value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Pagamento</p>
          <div className="grid grid-cols-3 gap-2">
            {(["pix", "cash", "card"] as PaymentMethod[]).map((m) => (
              <button key={m} type="button" onClick={() => setPayment(m)} className={cn("flex h-11 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium", payment === m ? "border-ember-500 bg-ember-50 text-ember-700" : "border-line bg-surface hover:bg-sunken")}>
                <Icon name={m === "pix" ? "pix" : m === "cash" ? "cash" : "card"} size={16} />
                {PAYMENT_METHOD[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {payment === "cash" && (
            <Field label="Valor recebido" help={change != null ? (change >= 0 ? `Troco: ${money(change)}` : "Valor insuficiente") : undefined}>
              <MoneyInput value={received} onChange={setReceived} />
            </Field>
          )}
          <Field label="Desconto (R$)">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
          <Field label="Cupom">
            <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Opcional" />
          </Field>
        </div>
        <Field label="Observação">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {mode === "admin" && <Checkbox checked={paid} onChange={setPaid} label="Pagamento já recebido" description="Desmarque para pedidos pagos na entrega." />}
      </div>

      <div className="safe-bottom border-t border-line bg-surface p-4">
        {quoteError && <Notice tone="error" className="mb-3">{quoteError}</Notice>}
        {quote?.coupon_error && <Notice tone="warn" className="mb-3">{quote.coupon_error}</Notice>}
        <dl className="mb-3 space-y-1 text-[13px]">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="num">{money(quote?.subtotal ?? subtotalPreview)}</dd></div>
          {!!quote?.delivery_fee && <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd className="num">{money(quote.delivery_fee)}</dd></div>}
          {(!!quote?.discount || manual > 0) && <div className="flex justify-between text-pickle-700"><dt>Descontos</dt><dd className="num">− {money((quote?.discount ?? 0) + manual)}</dd></div>}
          <div className="flex justify-between font-display text-xl font-bold"><dt>Total</dt><dd className="num">{money(total)}</dd></div>
        </dl>
        <Button variant="primary" size="xl" block loading={saving} disabled={!items.length || Boolean(quoteError)} onClick={submit}>
          {mode === "pdv" ? "Finalizar venda" : "Lançar pedido"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0">
        <div className="sticky top-14 z-10 -mx-3 bg-paper/95 px-3 pb-3 pt-1 backdrop-blur sm:mx-0 sm:px-0">
          <Input icon="search" placeholder="Buscar produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10" autoFocus />
          <div className="scroll-x mt-2 flex gap-1.5">
            {[{ id: "all", name: "Todos" }, ...sf.categories].map((c) => (
              <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={cn("h-8 shrink-0 rounded-md border px-3 text-[13px] font-medium", category === c.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 min-[1920px]:grid-cols-6">
          {products.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className={cn("group overflow-hidden rounded-lg border border-line bg-surface text-left shadow-card transition hover:border-ember-400 hover:shadow-pop active:scale-[0.98]", !p.is_available && "opacity-50")}>
              <Photo src={p.images[0]} alt={p.name} sizes="(min-width: 1280px) 220px, 45vw" rounded={false} className="aspect-[4/3] w-full" />
              <div className="p-2.5">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug">{p.name}</p>
                <p className="num mt-1 text-[13px] font-semibold text-ember-600">{money(basePrice(p))}{(p.groups.length > 0 || p.combo_groups.length > 0) && <span className="ml-1 text-[11px] font-normal text-muted">+ opções</span>}</p>
                {!p.is_available && <p className="text-[11px] font-medium text-ketchup-500">Esgotado</p>}
              </div>
            </button>
          ))}
          {products.length === 0 && <p className="col-span-full py-10 text-center text-[13px] text-muted">Nenhum produto encontrado.</p>}
        </div>
      </div>

      <aside className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:sticky lg:top-[72px] lg:block lg:h-[calc(100dvh-96px)]">{ticket}</aside>

      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 px-3 pb-2 lg:hidden">
        <button type="button" onClick={() => setTicketOpen(true)} className="flex h-13 w-full items-center justify-between rounded-lg bg-ink px-4 text-[15px] font-semibold text-white shadow-pop">
          <span>Ver pedido · {items.reduce((a, i) => a + i.quantity, 0)} itens</span>
          <span className="num">{money(total)}</span>
        </button>
      </div>
      <Sheet open={ticketOpen} onClose={() => setTicketOpen(false)} title={mode === "pdv" ? "Venda" : "Novo pedido"} mobile="full">
        {ticket}
      </Sheet>

      <Modal open={Boolean(customizing)} onClose={() => setCustomizing(null)} size="md">
        {customizing && (
          <div className="-mx-5 -my-4">
            <ProductCustomizer
              product={customizing.product}
              initial={customizing.item}
              submitLabel={customizing.item ? "Salvar alterações" : "Adicionar"}
              onSubmit={(item) => {
                setItems((l) => (customizing.item ? l.map((x) => (x.key === item.key ? item : x)) : [...l, item]));
                setCustomizing(null);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
