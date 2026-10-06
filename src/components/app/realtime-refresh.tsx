"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useApp } from "./app-context";

/** Atualiza os dados do servidor quando uma tabela da organização muda (Supabase Realtime). */
export function RealtimeRefresh({ tables, debounce = 600 }: { tables: string[]; debounce?: number }) {
  const { org } = useApp();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");
  useEffect(() => {
    const supabase = getBrowserClient();
    let channel = supabase.channel(`refresh-${org.id}-${key}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${org.id}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), debounce);
      });
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [org.id, key, router, debounce]);
  return null;
}
