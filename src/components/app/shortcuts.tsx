"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Modal } from "@/components/ui/modal";
import { useApp } from "./app-context";

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const LIST: { keys: string; label: string; href?: string; perm?: string }[] = [
  { keys: "Ctrl K", label: "Busca rápida (pedido, cliente, produto)" },
  { keys: "N", label: "Novo pedido", href: "/app/pedidos/novo", perm: "orders.create" },
  { keys: "P", label: "Pedidos", href: "/app/pedidos", perm: "orders.view" },
  { keys: "K", label: "Cozinha (KDS)", href: "/app/cozinha", perm: "kitchen.view" },
  { keys: "C", label: "Clientes", href: "/app/clientes", perm: "customers.view" },
  { keys: "X", label: "Caixa / PDV", href: "/app/caixa", perm: "cash.operate" },
  { keys: "M", label: "Cardápio", href: "/app/cardapio", perm: "menu.view" },
  { keys: "E", label: "Estoque", href: "/app/estoque", perm: "inventory.view" },
  { keys: "F", label: "Financeiro", href: "/app/financeiro", perm: "finance.view" },
  { keys: "R", label: "Relatórios", href: "/app/relatorios", perm: "reports.view" },
  { keys: "G D", label: "Visão geral", href: "/app", perm: "dashboard.view" },
  { keys: "?", label: "Mostrar atalhos" },
];

/** Atalhos de teclado (ignorados enquanto se digita em campos) */
export function Shortcuts({ onPalette }: { onPalette: () => void }) {
  const router = useRouter();
  const { permissions } = useApp();
  const [help, setHelp] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "?") return setHelp(true);
      if (k === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (k === "d" && Date.now() - pendingG.current < 800) return router.push("/app");
      const map: Record<string, string> = { n: "N", p: "P", k: "K", c: "C", x: "X", m: "M", e: "E", f: "F", r: "R" };
      const item = LIST.find((l) => l.keys === map[k]);
      if (item?.href && (!item.perm || permissions.includes(item.perm))) {
        e.preventDefault();
        router.push(item.href);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router, onPalette, permissions]);

  return (
    <Modal open={help} onClose={() => setHelp(false)} title="Atalhos de teclado" size="sm">
      <ul className="divide-y divide-line">
        {LIST.filter((l) => !l.perm || permissions.includes(l.perm)).map((l) => (
          <li key={l.keys} className="flex items-center justify-between py-2 text-[13px]">
            <span>{l.label}</span>
            <span className="flex gap-1">
              {l.keys.split(" ").map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
