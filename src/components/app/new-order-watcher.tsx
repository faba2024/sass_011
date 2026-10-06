"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { money } from "@/lib/format";
import { playChime } from "@/lib/sound";
import { getBrowserClient } from "@/lib/supabase/client";
import { useApp } from "./app-context";

/** Escuta pedidos novos da organização (Supabase Realtime) em qualquer tela do painel. */
export function NewOrderWatcher({ onNew }: { onNew?: (order: { id: string; number: number }) => void }) {
  const { org, can } = useApp();
  const toast = useToast();
  const router = useRouter();
  const seen = useRef(new Set<string>());
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const enabled = can("orders.view");

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`orders-watch-${org.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `organization_id=eq.${org.id}` }, (payload) => {
        const o = payload.new as { id: string; number: number; customer_name: string | null; total: number; source: string; type: string };
        if (seen.current.has(o.id) || o.source === "pdv" || o.source === "admin") return;
        seen.current.add(o.id);
        playChime();
        onNewRef.current?.(o);
        toast.show({
          kind: "order",
          title: `Novo pedido #${o.number}`,
          description: `${o.customer_name ?? "Cliente"} · ${money(o.total)}${o.type === "dine_in" ? " · Mesa" : ""}`,
          action: { label: "Ver pedido", onClick: () => router.push(`/app/pedidos/${o.id}`) },
          duration: 12000,
        });
        if (document.hidden) {
          try {
            if ("Notification" in window && Notification.permission === "granted") new Notification(`Novo pedido #${o.number}`, { body: `${o.customer_name ?? "Cliente"} · ${money(o.total)}`, tag: o.id });
          } catch {
            /* ignore */
          }
        }
      })
      .subscribe();
    if ("Notification" in window && Notification.permission === "default") {
      const ask = () => void Notification.requestPermission();
      window.addEventListener("pointerdown", ask, { once: true });
    }
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [org.id, enabled, toast, router]);

  return null;
}
