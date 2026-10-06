import { test } from "node:test";
import assert from "node:assert/strict";
import { cartSubtotal, reconcileCart, selectionErrors, unitPrice } from "../../src/lib/cart.ts";
import type { SfProduct, Storefront } from "../../src/lib/types.ts";

const burger: SfProduct = {
  id: "p1", category_id: "c1", type: "simple", name: "Levi Especial", description: null, ingredients: null,
  price: 32.9, promo_price: null, prep_minutes: 15, is_available: true, is_featured: true, sort: 1, images: [], combo_groups: [],
  groups: [
    { id: "g-ponto", name: "Ponto", description: null, kind: "variation", min_select: 1, max_select: 1, is_required: true, options: [
      { id: "m-mal", name: "Mal passado", price_delta: 0, max_quantity: 1, is_default: false },
      { id: "m-bem", name: "Bem passado", price_delta: 0, max_quantity: 1, is_default: false },
    ] },
    { id: "g-add", name: "Adicionais", description: null, kind: "addon", min_select: 0, max_select: 3, is_required: false, options: [
      { id: "m-bacon", name: "Bacon extra", price_delta: 5, max_quantity: 2, is_default: false },
      { id: "m-cheddar", name: "Cheddar", price_delta: 4.5, max_quantity: 2, is_default: false },
    ] },
  ],
};

test("preço unitário soma adicionais × quantidade", () => {
  assert.equal(unitPrice(burger, [{ modifier_id: "m-mal", quantity: 1 }, { modifier_id: "m-bacon", quantity: 2 }], []), 42.9);
});

test("preço promocional substitui o preço base", () => {
  assert.equal(unitPrice({ ...burger, promo_price: 29.9 }, [], []), 29.9);
});

test("grupo obrigatório e máximo de adicionais", () => {
  assert.deepEqual(Object.keys(selectionErrors(burger, [], [])), ["g-ponto"]);
  const tooMany = selectionErrors(burger, [{ modifier_id: "m-mal", quantity: 1 }, { modifier_id: "m-bacon", quantity: 2 }, { modifier_id: "m-cheddar", quantity: 2 }], []);
  assert.equal(tooMany["g-add"], "Máximo de 3");
});

test("subtotal do carrinho com arredondamento em centavos", () => {
  const cart = { slug: "x", items: [{ unit_price: 0.1, quantity: 3 }, { unit_price: 32.9, quantity: 2 }] } as never;
  assert.equal(cartSubtotal(cart), 66.1);
});

test("reconciliação remove item esgotado e atualiza preço alterado", () => {
  const sf = { products: [{ ...burger, price: 34.9 }, { ...burger, id: "p2", name: "Smash", is_available: false }] } as unknown as Storefront;
  const cart = {
    slug: "levi", updated_at: Date.now(),
    items: [
      { key: "a", product_id: "p1", name: "Levi Especial", image: null, unit_price: 32.9, quantity: 1, notes: "", options: [{ modifier_id: "m-mal", group_id: "g-ponto", group_name: "Ponto", kind: "variation", name: "Mal passado", price_delta: 0, quantity: 1 }], combo: [] },
      { key: "b", product_id: "p2", name: "Smash", image: null, unit_price: 28, quantity: 1, notes: "", options: [], combo: [] },
    ],
  } as never;
  const r = reconcileCart(cart, sf);
  assert.equal(r.cart.items.length, 1);
  assert.equal(r.cart.items[0].unit_price, 34.9);
  assert.ok(r.notices.length >= 2);
});
