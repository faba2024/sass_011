import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { Storefront } from "./types";

/** Cardápio completo da loja (RPC pública, sem sessão). Cacheado por requisição. */
export const getStorefront = cache(async (slug: string): Promise<Storefront | null> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_storefront", { p_slug: slug.toLowerCase() });
  if (error) throw new Error(error.message);
  return (data as Storefront | null) ?? null;
});
