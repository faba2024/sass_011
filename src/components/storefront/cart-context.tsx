"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { cartCount, cartSubtotal, emptyCart, loadCart, reconcileCart, saveCart, type Cart, type CartItem } from "@/lib/cart";
import type { SfProduct, Storefront } from "@/lib/types";
import { uid } from "@/lib/utils";

interface CartApi {
  sf: Storefront;
  cart: Cart;
  ready: boolean;
  count: number;
  subtotal: number;
  add(item: CartItem): void;
  update(item: CartItem): void;
  remove(key: string): void;
  duplicate(key: string): void;
  setQty(key: string, qty: number): void;
  clear(): void;
  setCoupon(code: string | null): void;
  setTable(t: { token: string; label: string } | null): void;
  openProduct(p: SfProduct, item?: CartItem | null): void;
  closeProduct(): void;
  editing: { product: SfProduct; item: CartItem | null } | null;
  drawerOpen: boolean;
  setDrawerOpen(v: boolean): void;
}

const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ sf, children }: { sf: Storefront; children: ReactNode }) {
  const toast = useToast();
  const [cart, setCart] = useState<Cart>(() => emptyCart(sf.org.slug));
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<{ product: SfProduct; item: CartItem | null } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notified = useRef(false);

  // Carrega do navegador e reconcilia com o cardápio atual (removidos, esgotados, preço novo)
  useEffect(() => {
    const loaded = loadCart(sf.org.slug);
    const { cart: fixed, notices } = reconcileCart(loaded, sf);
    setCart(fixed);
    setReady(true);
    if (notices.length && !notified.current) {
      notified.current = true;
      notices.slice(0, 3).forEach((n) => toast.info("Carrinho atualizado", n));
    }
  }, [sf, toast]);

  useEffect(() => {
    if (ready) saveCart(cart);
  }, [cart, ready]);

  // Sincroniza entre abas
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key === `tb_cart_${sf.org.slug}`) setCart(reconcileCart(loadCart(sf.org.slug), sf).cart);
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, [sf]);

  const add = useCallback((item: CartItem) => setCart((c) => ({ ...c, items: [...c.items, item] })), []);
  const update = useCallback((item: CartItem) => setCart((c) => ({ ...c, items: c.items.map((i) => (i.key === item.key ? item : i)) })), []);
  const remove = useCallback((key: string) => setCart((c) => ({ ...c, items: c.items.filter((i) => i.key !== key) })), []);
  const duplicate = useCallback((key: string) => setCart((c) => {
    const idx = c.items.findIndex((i) => i.key === key);
    if (idx < 0) return c;
    const items = [...c.items];
    items.splice(idx + 1, 0, { ...c.items[idx], key: uid() });
    return { ...c, items };
  }), []);
  const setQty = useCallback((key: string, qty: number) => setCart((c) => ({ ...c, items: qty <= 0 ? c.items.filter((i) => i.key !== key) : c.items.map((i) => (i.key === key ? { ...i, quantity: Math.min(99, qty) } : i)) })), []);
  const clear = useCallback(() => setCart((c) => ({ ...emptyCart(c.slug), table: c.table })), []);
  const setCoupon = useCallback((code: string | null) => setCart((c) => ({ ...c, coupon_code: code })), []);
  const setTable = useCallback((t: { token: string; label: string } | null) => setCart((c) => ({ ...c, table: t })), []);

  const api = useMemo<CartApi>(
    () => ({
      sf, cart, ready, count: cartCount(cart), subtotal: cartSubtotal(cart),
      add, update, remove, duplicate, setQty, clear, setCoupon, setTable,
      openProduct: (product, item = null) => setEditing({ product, item }),
      closeProduct: () => setEditing(null),
      editing, drawerOpen, setDrawerOpen,
    }),
    [sf, cart, ready, add, update, remove, duplicate, setQty, clear, setCoupon, setTable, editing, drawerOpen],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart fora do CartProvider");
  return v;
}
