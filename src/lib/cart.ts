// Carrinho do cliente — persistido no navegador (temporário, 48 h).
// Os valores aqui são apenas PRÉVIA: o servidor recalcula tudo em quote_order/place_order.
import type { SfProduct, Storefront } from "./types";

export const CART_TTL_MS = 48 * 60 * 60 * 1000;

export interface CartOption {
  modifier_id: string;
  quantity: number;
  name: string;
  group_id: string;
  group_name: string;
  group_kind: "variation" | "addon" | "removal";
  price_delta: number;
}
export interface CartComboChoice {
  combo_group_id: string;
  group_name: string;
  product_id: string;
  name: string;
  price_delta: number;
}
export interface CartItem {
  key: string;
  product_id: string;
  name: string;
  image: string | null;
  quantity: number;
  notes: string;
  options: CartOption[];
  combo: CartComboChoice[];
  unit_price: number;
}
export interface Cart {
  slug: string;
  items: CartItem[];
  coupon_code: string | null;
  table: { token: string; label: string } | null;
  updated_at: number;
}

export function emptyCart(slug: string): Cart {
  return { slug, items: [], coupon_code: null, table: null, updated_at: Date.now() };
}

export function storageKey(slug: string) {
  return `tb_cart_${slug}`;
}

export function loadCart(slug: string): Cart {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return emptyCart(slug);
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || parsed.slug !== slug || Date.now() - parsed.updated_at > CART_TTL_MS) return emptyCart(slug);
    return { ...emptyCart(slug), ...parsed };
  } catch {
    return emptyCart(slug);
  }
}

export function saveCart(cart: Cart) {
  try {
    localStorage.setItem(storageKey(cart.slug), JSON.stringify({ ...cart, updated_at: Date.now() }));
  } catch {
    /* armazenamento indisponível (aba anônima): o carrinho segue em memória */
  }
}

export function basePrice(p: Pick<SfProduct, "price" | "promo_price">) {
  return p.promo_price != null ? Number(p.promo_price) : Number(p.price);
}

export function unitPrice(product: SfProduct, options: { modifier_id: string; quantity: number }[], combo: { combo_group_id: string; product_id: string }[]) {
  let total = basePrice(product);
  for (const o of options) {
    const opt = product.groups.flatMap((g) => g.options).find((x) => x.id === o.modifier_id);
    if (opt) total += Number(opt.price_delta) * o.quantity;
  }
  for (const c of combo) {
    const g = product.combo_groups.find((x) => x.id === c.combo_group_id);
    const opt = g?.options.find((x) => x.product_id === c.product_id);
    if (opt) total += Number(opt.price_delta);
  }
  return Math.round(total * 100) / 100;
}

/** Erros de personalização por grupo (para bloquear "Adicionar" no cliente). */
export function selectionErrors(product: SfProduct, options: { modifier_id: string; quantity: number }[], combo: { combo_group_id: string; product_id: string }[]) {
  const errors: Record<string, string> = {};
  for (const g of product.groups) {
    const count = options.filter((o) => g.options.some((x) => x.id === o.modifier_id)).reduce((a, o) => a + o.quantity, 0);
    if (count < g.min_select) errors[g.id] = g.min_select === 1 ? "Escolha 1 opção" : `Escolha ${g.min_select} opções`;
    else if (count > g.max_select) errors[g.id] = `Máximo de ${g.max_select}`;
  }
  for (const g of product.combo_groups) {
    const count = combo.filter((c) => c.combo_group_id === g.id).length;
    if (count < g.min_qty) errors[g.id] = "Obrigatório";
    else if (count > g.max_qty) errors[g.id] = `Máximo de ${g.max_qty}`;
  }
  return errors;
}

/** Item → payload do servidor (somente IDs e quantidades) */
export function toPayloadItem(item: CartItem) {
  return {
    key: item.key,
    product_id: item.product_id,
    quantity: item.quantity,
    notes: item.notes || undefined,
    options: item.options.map((o) => ({ modifier_id: o.modifier_id, quantity: o.quantity })),
    combo: item.combo.map((c) => ({ combo_group_id: c.combo_group_id, product_id: c.product_id })),
  };
}

export function cartCount(cart: Cart) {
  return cart.items.reduce((a, i) => a + i.quantity, 0);
}
export function cartSubtotal(cart: Cart) {
  return Math.round(cart.items.reduce((a, i) => a + i.unit_price * i.quantity, 0) * 100) / 100;
}

/**
 * Reconciliação com o cardápio atual: remove itens excluídos/esgotados/com opções
 * que deixaram de existir e atualiza preços que mudaram. Retorna avisos para o cliente.
 */
export function reconcileCart(cart: Cart, sf: Storefront): { cart: Cart; notices: string[] } {
  const notices: string[] = [];
  const items: CartItem[] = [];
  for (const item of cart.items) {
    const product = sf.products.find((p) => p.id === item.product_id);
    if (!product) {
      notices.push(`"${item.name}" saiu do cardápio e foi removido do carrinho.`);
      continue;
    }
    if (!product.is_available) {
      notices.push(`"${item.name}" está esgotado e foi removido do carrinho.`);
      continue;
    }
    const allOptions = product.groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g })));
    const optionsOk = item.options.every((o) => {
      const opt = allOptions.find((x) => x.id === o.modifier_id);
      return opt && o.quantity <= opt.max_quantity;
    });
    const comboOk = item.combo.every((c) =>
      product.combo_groups.some((g) => g.id === c.combo_group_id && g.options.some((x) => x.product_id === c.product_id && x.is_available)),
    );
    const errs = selectionErrors(product, item.options, item.combo);
    if (!optionsOk || !comboOk || Object.keys(errs).length) {
      notices.push(`As opções de "${item.name}" mudaram. Adicione o item novamente.`);
      continue;
    }
    const price = unitPrice(product, item.options, item.combo);
    if (Math.abs(price - item.unit_price) > 0.001) {
      notices.push(`O preço de "${item.name}" foi atualizado.`);
    }
    items.push({
      ...item,
      name: product.name,
      image: product.images[0] ?? item.image,
      unit_price: price,
      options: item.options.map((o) => {
        const opt = allOptions.find((x) => x.id === o.modifier_id)!;
        return { ...o, name: opt.name, price_delta: Number(opt.price_delta), group_name: opt.group.name, group_kind: opt.group.kind, group_id: opt.group.id };
      }),
    });
  }
  return { cart: { ...cart, items }, notices };
}

/** Descrição curta das escolhas: "2 carnes · Sem cebola · + Bacon extra (2x)" */
export function describeItem(item: Pick<CartItem, "options" | "combo">) {
  const parts: string[] = [];
  for (const c of item.combo) parts.push(c.name);
  for (const o of item.options) {
    if (o.group_kind === "removal") parts.push(o.name);
    else if (o.group_kind === "addon") parts.push(`+ ${o.name}${o.quantity > 1 ? ` (${o.quantity}x)` : ""}`);
    else parts.push(o.name);
  }
  return parts.join(" · ");
}
