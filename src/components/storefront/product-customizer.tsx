"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Photo } from "@/components/ui/photo";
import { basePrice, selectionErrors, unitPrice, type CartComboChoice, type CartItem, type CartOption } from "@/lib/cart";
import { money } from "@/lib/format";
import type { SfGroup, SfProduct } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

function Stepper({ value, onChange, min = 0, max, size = "md", label }: { value: number; onChange: (v: number) => void; min?: number; max: number; size?: "sm" | "md"; label: string }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={cn("grid place-items-center rounded-full border border-line-strong text-ink disabled:opacity-30", dim)}>
        <Icon name="minus" size={16} strokeWidth={2.2} />
      </button>
      <span className="num w-7 text-center text-[15px] font-semibold">{value}</span>
      <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={cn("grid place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-30", dim)}>
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function groupRule(g: { min_select: number; max_select: number; kind: string }) {
  if (g.kind === "removal") return "Opcional";
  if (g.min_select > 0 && g.min_select === g.max_select) return `Obrigatório · escolha ${g.min_select}`;
  if (g.min_select > 0) return `Obrigatório · ${g.min_select} a ${g.max_select}`;
  return g.max_select === 1 ? "Opcional · até 1" : `Opcional · até ${g.max_select}`;
}

export function ProductCustomizer({
  product,
  initial,
  onSubmit,
  submitLabel = "Adicionar",
  disabled,
  disabledReason,
  className,
  sticky = true,
}: {
  product: SfProduct;
  initial?: CartItem | null;
  onSubmit: (item: CartItem) => void;
  submitLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  sticky?: boolean;
}) {
  const defaults = useMemo(() => {
    const opts: { modifier_id: string; quantity: number }[] = [];
    for (const g of product.groups) {
      if (g.kind === "variation" && g.min_select > 0) {
        const def = g.options.find((o) => o.is_default) ?? (g.min_select === 1 && g.options.length === 1 ? g.options[0] : null);
        if (def) opts.push({ modifier_id: def.id, quantity: 1 });
      }
    }
    return opts;
  }, [product]);

  const [options, setOptions] = useState<{ modifier_id: string; quantity: number }[]>(() => initial?.options.map((o) => ({ modifier_id: o.modifier_id, quantity: o.quantity })) ?? defaults);
  const [combo, setCombo] = useState<{ combo_group_id: string; product_id: string }[]>(() => initial?.combo.map((c) => ({ combo_group_id: c.combo_group_id, product_id: c.product_id })) ?? []);
  const [qty, setQty] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tried, setTried] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const gallery = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setOptions(initial?.options.map((o) => ({ modifier_id: o.modifier_id, quantity: o.quantity })) ?? defaults);
    setCombo(initial?.combo.map((c) => ({ combo_group_id: c.combo_group_id, product_id: c.product_id })) ?? []);
    setQty(initial?.quantity ?? 1);
    setNotes(initial?.notes ?? "");
    setTried(false);
  }, [product.id, initial, defaults]);

  const errors = selectionErrors(product, options, combo);
  const valid = Object.keys(errors).length === 0;
  const unit = unitPrice(product, options, combo);
  const base = basePrice(product);

  const countIn = (g: SfGroup) => options.filter((o) => g.options.some((x) => x.id === o.modifier_id)).reduce((a, o) => a + o.quantity, 0);
  const qtyOf = (id: string) => options.find((o) => o.modifier_id === id)?.quantity ?? 0;

  const setOption = (g: SfGroup, id: string, quantity: number) => {
    setOptions((prev) => {
      let next = prev.filter((o) => o.modifier_id !== id);
      if (g.max_select === 1 && g.kind !== "addon" && quantity > 0) {
        // escolha única: troca a opção do grupo
        next = next.filter((o) => !g.options.some((x) => x.id === o.modifier_id));
      }
      if (quantity > 0) next.push({ modifier_id: id, quantity });
      return next;
    });
  };

  const pickCombo = (groupId: string, productId: string, max: number) => {
    setCombo((prev) => {
      const inGroup = prev.filter((c) => c.combo_group_id === groupId);
      const already = inGroup.some((c) => c.product_id === productId);
      if (max === 1) return [...prev.filter((c) => c.combo_group_id !== groupId), { combo_group_id: groupId, product_id: productId }];
      if (already) return prev.filter((c) => !(c.combo_group_id === groupId && c.product_id === productId));
      if (inGroup.length >= max) return prev;
      return [...prev, { combo_group_id: groupId, product_id: productId }];
    });
  };

  const submit = () => {
    setTried(true);
    if (!valid) {
      const first = [...product.combo_groups.map((g) => g.id), ...product.groups.map((g) => g.id)].find((id) => errors[id]);
      if (first) refs.current[first]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const cartOptions: CartOption[] = options.map((o) => {
      const g = product.groups.find((gg) => gg.options.some((x) => x.id === o.modifier_id))!;
      const opt = g.options.find((x) => x.id === o.modifier_id)!;
      return { modifier_id: o.modifier_id, quantity: o.quantity, name: opt.name, group_id: g.id, group_name: g.name, group_kind: g.kind, price_delta: Number(opt.price_delta) };
    });
    const cartCombo: CartComboChoice[] = combo.map((c) => {
      const g = product.combo_groups.find((gg) => gg.id === c.combo_group_id)!;
      const opt = g.options.find((x) => x.product_id === c.product_id)!;
      return { combo_group_id: g.id, group_name: g.name, product_id: c.product_id, name: opt.name, price_delta: Number(opt.price_delta) };
    });
    onSubmit({
      key: initial?.key ?? uid(),
      product_id: product.id,
      name: product.name,
      image: product.images[0] ?? null,
      quantity: qty,
      notes: notes.trim().slice(0, 200),
      options: cartOptions,
      combo: cartCombo,
      unit_price: unit,
    });
  };

  const ordered = [...product.groups].sort((a, b) => {
    const rank = (g: SfGroup) => (g.kind === "variation" ? 0 : g.kind === "removal" ? 1 : 2);
    return rank(a) - rank(b);
  });

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1">
        {/* Galeria */}
        <div className="relative">
          <div
            ref={gallery}
            className="scroll-x flex snap-x snap-mandatory"
            onScroll={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              setImgIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
          >
            {(product.images.length ? product.images : [null]).map((src, i) => (
              <div key={i} className="w-full shrink-0 snap-center">
                <Photo src={src} alt={product.name} sizes="(min-width: 768px) 560px, 100vw" priority={i === 0} rounded={false} className="aspect-[4/3] w-full sm:aspect-[16/10]" />
              </div>
            ))}
          </div>
          {product.images.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {product.images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Foto ${i + 1}`}
                  onClick={() => gallery.current?.scrollTo({ left: i * (gallery.current?.clientWidth ?? 0), behavior: "smooth" })}
                  className={cn("h-1.5 rounded-full bg-white/90 shadow transition-all", imgIndex === i ? "w-5" : "w-1.5 opacity-60")}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-4 pt-4">
          <h2 className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em]">{product.name}</h2>
          {product.description && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{product.description}</p>}
          {product.ingredients && <p className="mt-2 text-[13px] leading-relaxed text-muted"><span className="font-medium text-ink-2">Ingredientes:</span> {product.ingredients}</p>}
          <div className="mt-3 flex items-baseline gap-2">
            {product.promo_price != null && <span className="num text-sm text-muted line-through">{money(product.price)}</span>}
            <span className="num font-display text-xl font-bold text-ink">{money(base)}</span>
            {product.promo_price != null && <span className="rounded-sm bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-ink">Promo</span>}
          </div>
          {!product.is_available && <p className="mt-3 rounded-md bg-ketchup-50 px-3 py-2 text-[13px] font-medium text-ketchup-700">Esgotado no momento</p>}
        </div>

        {/* Combo: escolhas */}
        {product.combo_groups.map((g) => {
          const chosen = combo.filter((c) => c.combo_group_id === g.id);
          const err = tried && errors[g.id];
          return (
            <section key={g.id} ref={(el) => { refs.current[g.id] = el; }} className="border-t-8 border-sunken">
              <header className={cn("sticky top-0 z-10 flex items-center justify-between gap-3 bg-paper px-5 py-3", err && "bg-ketchup-50")}>
                <div>
                  <h3 className="text-[15px] font-semibold">{g.name}</h3>
                  <p className={cn("text-xs", err ? "font-medium text-ketchup-500" : "text-muted")}>{err || (g.max_qty > 1 ? `Escolha até ${g.max_qty}` : "Escolha 1")}</p>
                </div>
                <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase", chosen.length >= g.min_qty ? "bg-pickle-50 text-pickle-700" : "bg-ink text-white")}>
                  {chosen.length >= g.min_qty ? "✓" : "Obrigatório"}
                </span>
              </header>
              <ul>
                {g.options.map((o) => {
                  const on = chosen.some((c) => c.product_id === o.product_id);
                  return (
                    <li key={o.product_id} className="border-b border-line last:border-0">
                      <button type="button" disabled={!o.is_available} onClick={() => pickCombo(g.id, o.product_id, g.max_qty)} className="flex w-full items-center gap-3 px-5 py-3 text-left disabled:opacity-40">
                        <Photo src={o.image} alt="" sizes="48px" className="h-12 w-12 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium">{o.name}</span>
                          <span className="block text-xs text-muted">{!o.is_available ? "Esgotado" : Number(o.price_delta) > 0 ? `+ ${money(o.price_delta)}` : "Incluso"}</span>
                        </span>
                        <span className={cn("grid h-6 w-6 shrink-0 place-items-center border-2", g.max_qty === 1 ? "rounded-full" : "rounded-md", on ? "border-brand bg-brand text-brand-ink" : "border-line-strong")}>
                          {on && <Icon name="check" size={14} strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/* Variações / remoções / adicionais */}
        {ordered.map((g) => {
          const count = countIn(g);
          const err = tried && errors[g.id];
          const single = g.max_select === 1 && g.kind !== "addon";
          return (
            <section key={g.id} ref={(el) => { refs.current[g.id] = el; }} className="border-t-8 border-sunken">
              <header className={cn("sticky top-0 z-10 flex items-center justify-between gap-3 bg-paper px-5 py-3", err && "bg-ketchup-50")}>
                <div>
                  <h3 className="text-[15px] font-semibold">{g.name}</h3>
                  <p className={cn("text-xs", err ? "font-medium text-ketchup-500" : "text-muted")}>{err || g.description || groupRule(g)}</p>
                </div>
                {g.is_required ? (
                  <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase", count >= g.min_select ? "bg-pickle-50 text-pickle-700" : "bg-ink text-white")}>
                    {count >= g.min_select ? "✓" : "Obrigatório"}
                  </span>
                ) : (
                  <span className="num text-xs text-muted">{count}/{g.max_select}</span>
                )}
              </header>
              <ul>
                {g.options.map((o) => {
                  const q = qtyOf(o.id);
                  const groupFull = count >= g.max_select;
                  if (g.kind === "addon") {
                    return (
                      <li key={o.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium">{o.name}</span>
                          <span className="num block text-xs text-muted">{Number(o.price_delta) > 0 ? `+ ${money(o.price_delta)}` : "Grátis"}</span>
                        </span>
                        {o.max_quantity > 1 ? (
                          <Stepper size="sm" label={o.name} value={q} max={Math.min(o.max_quantity, q + (g.max_select - count))} onChange={(v) => setOption(g, o.id, v)} />
                        ) : (
                          <button type="button" disabled={!q && groupFull} onClick={() => setOption(g, o.id, q ? 0 : 1)} className={cn("grid h-6 w-6 place-items-center rounded-md border-2 disabled:opacity-30", q ? "border-brand bg-brand text-brand-ink" : "border-line-strong")} aria-label={o.name} aria-pressed={q > 0}>
                            {q > 0 && <Icon name="check" size={14} strokeWidth={3} />}
                          </button>
                        )}
                      </li>
                    );
                  }
                  return (
                    <li key={o.id} className="border-b border-line last:border-0">
                      <button type="button" disabled={!q && groupFull && !single} onClick={() => setOption(g, o.id, single ? 1 : q ? 0 : 1)} aria-pressed={q > 0} className="flex w-full items-center gap-3 px-5 py-3 text-left disabled:opacity-40">
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[14px] font-medium", g.kind === "removal" && q > 0 && "text-ketchup-700")}>{o.name}</span>
                          {Number(o.price_delta) > 0 && <span className="num block text-xs text-muted">+ {money(o.price_delta)}</span>}
                        </span>
                        <span className={cn("grid h-6 w-6 shrink-0 place-items-center border-2", single ? "rounded-full" : "rounded-md", q ? (g.kind === "removal" ? "border-ketchup-500 bg-ketchup-500 text-white" : "border-brand bg-brand text-brand-ink") : "border-line-strong")}>
                          {q > 0 && (single ? <span className="h-2 w-2 rounded-full bg-current" /> : <Icon name={g.kind === "removal" ? "x" : "check"} size={13} strokeWidth={3} />)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section className="border-t-8 border-sunken px-5 py-4">
          <label htmlFor={`notes-${product.id}`} className="text-[15px] font-semibold">Alguma observação?</label>
          <textarea
            id={`notes-${product.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            rows={2}
            placeholder="Ex.: caprichar no molho, pão bem tostado…"
            className="mt-2 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-[14px] focus:border-brand focus:outline-none"
          />
          <p className="num mt-1 text-right text-[11px] text-faint">{notes.length}/200</p>
        </section>
      </div>

      <footer className={cn("safe-bottom flex items-center gap-3 border-t border-line bg-surface px-4 py-3", sticky && "sticky bottom-0")}>
        <Stepper label="quantidade" value={qty} min={1} max={99} onChange={setQty} />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !product.is_available}
          className={cn(
            "flex h-12 flex-1 items-center justify-between gap-2 rounded-lg px-4 text-[15px] font-semibold transition-opacity disabled:opacity-40",
            valid ? "bg-brand text-brand-ink" : "bg-ink/80 text-white",
          )}
        >
          <span>{disabled && disabledReason ? disabledReason : submitLabel}</span>
          <span className="num">{money(unit * qty)}</span>
        </button>
      </footer>
    </div>
  );
}
