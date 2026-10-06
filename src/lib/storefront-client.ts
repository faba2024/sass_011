"use client";
import { getBrowserClient } from "@/lib/supabase/client";
import type { PublicOrder, Quote } from "./types";

// Chamadas públicas do cardápio direto ao Supabase (RPCs com validação no servidor)

export async function rpcQuote(slug: string, payload: unknown): Promise<{ data: Quote | null; error: string | null }> {
  const { data, error } = await getBrowserClient().rpc("quote_order", { p_slug: slug, p_payload: payload });
  return { data: (data as Quote) ?? null, error: error?.message ?? null };
}

export async function rpcPlaceOrder(slug: string, payload: unknown): Promise<{ data: { id: string; number: number; token: string; status: string; total: number } | null; error: string | null }> {
  const { data, error } = await getBrowserClient().rpc("place_order", { p_slug: slug, p_payload: payload });
  return { data: data ?? null, error: error?.message ?? null };
}

export async function rpcPublicOrder(token: string): Promise<PublicOrder | null> {
  const { data } = await getBrowserClient().rpc("get_public_order", { p_token: token });
  return (data as PublicOrder) ?? null;
}

export async function rpcSubmitReview(token: string, rating: number, comment: string) {
  const { error } = await getBrowserClient().rpc("submit_review", { p_token: token, p_rating: rating, p_comment: comment || null });
  return error?.message ?? null;
}

/** Endereço pelo CEP (ViaCEP, público). Falha silenciosa: o cliente digita manualmente. */
export async function lookupCep(cep: string): Promise<{ street: string; district: string; city: string; state: string } | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const j = (await res.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
    if (j.erro) return null;
    return { street: j.logradouro ?? "", district: j.bairro ?? "", city: j.localidade ?? "", state: j.uf ?? "" };
  } catch {
    return null;
  }
}

// Dados do cliente salvos NESTE aparelho para agilizar o próximo pedido (preferência local)
const PROFILE_KEY = "tb_customer";
export interface LocalProfile {
  name: string;
  phone: string;
  addresses: { zip: string; street: string; number: string; district: string; complement: string; reference: string; city: string }[];
}
export function loadProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}
export function saveProfile(p: LocalProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, addresses: p.addresses.slice(0, 5) }));
  } catch {
    /* ignore */
  }
}
export function forgetProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
