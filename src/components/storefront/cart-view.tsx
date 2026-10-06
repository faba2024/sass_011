"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { describeItem, toPayloadItem } from "@/lib/cart";
import { maskPhone, money, onlyDigits } from "@/lib/format";
import { loadProfile, rpcQuote } from "@/lib/storefront-client";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";

export function CartView({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const { sf, cart, count, subtotal, setQty, remove, duplicate, openProduct, setCoupon, clear } = useCart();
  const [code, setCode] = useState(cart.coupon_code ?? "");
  const [couponState, setCouponState] = useState<{ discount: number; error: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [couponPhone, setCouponPhone] = useState("");
  const [needsCouponPhone, setNeedsCouponPhone] = useState(false);
  const slug = sf.org.slug;

  useEffect(() => {
    const saved = loadProfile();
    if (saved?.phone) setCouponPhone(maskPhone(saved.phone));
  }, []);

  const validate = async (c: string) => {
    if (!c.trim()) {
      setCoupon(null);
      setCouponState(null);
      return;
    }
    setChecking(true);
    const phone = onlyDigits(couponPhone);
    const { data, error } = await rpcQuote(slug, {
      type: "pickup",
      coupon_code: c.trim(),
      customer: phone ? { phone } : undefined,
      items: cart.items.map(toPayloadItem),
    });
    setChecking(false);
    if (error) {
      setNeedsCouponPhone(/telefone/i.test(error));
      return setCouponState({ discount: 0, error });
    }
    if (data?.coupon_error) {
      setNeedsCouponPhone(/telefone/i.test(data.coupon_error));
      setCouponState({ discount: 0, error: data.coupon_error });
      setCoupon(c.trim().toUpperCase());
      return;
    }
    setNeedsCouponPhone(false);
    setCoupon(c.trim().toUpperCase());
    setCouponState({ discount: Number(data?.discount ?? 0), error: null });
  };

  useEffect(() => {
    if (cart.coupon_code && cart.items.length) void validate(cart.coupon_code);
    // revalida quando os itens mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items.length, subtotal]);

  const minFee = sf.zones.length ? Math.min(...sf.zones.map((z) => Number(z.fee))) : 0;

  if (!count) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="bag" size={24} />
        </div>
        <p className="mt-4 font-display text-lg font-semibold">Seu carrinho está vazio</p>
        <p className="mt-1 text-sm text-muted">Escolha um burger e personalize do seu jeito.</p>
        <Link href={`/${slug}`} onClick={onNavigate} className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand px-5 text-[15px] font-semibold text-brand-ink">
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        {cart.table && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-[13px] font-medium">
            <Icon name="table" size={16} /> Pedido para a {cart.table.label}
          </div>
        )}
        <ul className="divide-y divide-line">
          {cart.items.map((it) => {
            const product = sf.products.find((p) => p.id === it.product_id);
            return (
              <li key={it.key} className="flex gap-3 px-4 py-4">
                <Photo src={it.image} alt={it.name} sizes="64px" className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-semibold leading-snug">{it.name}</p>
                    <p className="num shrink-0 text-[15px] font-semibold">{money(it.unit_price * it.quantity)}</p>
                  </div>
                  {(it.options.length > 0 || it.combo.length > 0) && <p className="mt-0.5 text-[13px] leading-snug text-muted">{describeItem(it)}</p>}
                  {it.notes && <p className="mt-0.5 text-[13px] italic text-ink-2">“{it.notes}”</p>}
                  <p className="num mt-0.5 text-xs text-faint">{money(it.unit_price)} cada</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-full border border-line">
                      <button type="button" aria-label="Diminuir" onClick={() => setQty(it.key, it.quantity - 1)} className="grid h-8 w-8 place-items-center">
                        <Icon name={it.quantity === 1 ? "trash" : "minus"} size={15} />
                      </button>
                      <span className="num w-6 text-center text-[14px] font-semibold">{it.quantity}</span>
                      <button type="button" aria-label="Aumentar" onClick={() => setQty(it.key, it.quantity + 1)} className="grid h-8 w-8 place-items-center text-brand">
                        <Icon name="plus" size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                    {product && (product.groups.length > 0 || product.combo_groups.length > 0 || it.notes) && (
                      <button type="button" onClick={() => openProduct(product, it)} className="text-[13px] font-medium text-ink-2 underline-offset-2 hover:underline">Editar</button>
                    )}
                    <button type="button" onClick={() => duplicate(it.key)} className="text-[13px] font-medium text-ink-2 underline-offset-2 hover:underline">Duplicar</button>
                    <button type="button" onClick={() => remove(it.key)} className="text-[13px] font-medium text-ketchup-500 underline-offset-2 hover:underline">Remover</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-4 pb-2">
          <Link href={`/${slug}`} onClick={onNavigate} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-2 hover:underline">
            <Icon name="plus" size={15} /> Adicionar mais itens
          </Link>
        </div>

        <div className="border-t-8 border-sunken px-4 py-4">
          <label htmlFor="coupon" className="text-[14px] font-semibold">Possui cupom?</label>
          <div className="mt-2 flex gap-2">
            <input
              id="coupon"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex.: LEVI10"
              className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-[15px] uppercase tracking-wide focus:border-brand focus:outline-none"
            />
            <button type="button" onClick={() => validate(code)} disabled={checking} className="h-11 rounded-lg border border-ink px-4 text-[14px] font-semibold disabled:opacity-50">
              {checking ? "…" : cart.coupon_code && !couponState?.error ? "Trocar" : "Aplicar"}
            </button>
          </div>
          {needsCouponPhone && (
            <div className="mt-2 rounded-lg border border-line bg-sunken p-3">
              <label htmlFor="coupon-phone" className="text-[13px] font-semibold text-ink-2">Celular/WhatsApp para validar o cupom</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="coupon-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={couponPhone}
                  onChange={(e) => setCouponPhone(maskPhone(e.target.value))}
                  placeholder="(71) 99999-0000"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[15px] focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => validate(code)}
                  disabled={checking || onlyDigits(couponPhone).length < 10}
                  className="h-11 rounded-lg bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  Validar
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">Usamos o número somente para verificar as regras deste cupom.</p>
            </div>
          )}
          {couponState?.error && !needsCouponPhone && <p className="mt-1.5 text-[13px] text-ketchup-500">{couponState.error}</p>}
          {couponState && !couponState.error && cart.coupon_code && (
            <p className="mt-1.5 flex items-center justify-between text-[13px] text-pickle-700">
              <span>Cupom {cart.coupon_code} aplicado{couponState.discount ? ` · − ${money(couponState.discount)}` : " · desconto aplicado no frete"}</span>
              <button type="button" onClick={() => { setCode(""); void validate(""); }} className="font-medium underline">remover</button>
            </p>
          )}
        </div>
      </div>

      <div className={cn("safe-bottom border-t border-line bg-surface px-4 pb-4 pt-3", !compact && "sticky bottom-0")}>
        <dl className="space-y-1 text-[14px]">
          <div className="flex justify-between"><dt className="text-muted">Produtos</dt><dd className="num">{money(subtotal)}</dd></div>
          {!cart.table && sf.org.accepts_delivery && (
            <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd className="text-muted">{sf.zones.length ? `a partir de ${money(minFee)}` : "—"}</dd></div>
          )}
          {couponState && !couponState.error && couponState.discount > 0 && (
            <div className="flex justify-between text-pickle-700"><dt>Desconto</dt><dd className="num">− {money(couponState.discount)}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-display text-lg font-bold"><dt>Total</dt><dd className="num">{money(subtotal - (couponState?.discount ?? 0))}</dd></div>
        </dl>
        <Link href={`/${slug}/checkout`} onClick={onNavigate} className="mt-3 flex h-13 items-center justify-center rounded-lg bg-brand text-[16px] font-bold uppercase tracking-wide text-brand-ink">
          Continuar pedido
        </Link>
        <button type="button" onClick={clear} className="mt-2 w-full text-center text-[13px] text-muted hover:text-ketchup-500">Esvaziar carrinho</button>
      </div>
    </div>
  );
}
