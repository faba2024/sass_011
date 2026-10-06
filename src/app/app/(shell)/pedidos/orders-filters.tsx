"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD } from "@/lib/constants";
import { downloadCSV } from "@/lib/csv";
import { exportOrdersAction } from "./actions";

export function OrdersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const apply = (patch: Record<string, string>) => {
    const u = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? u.set(k, v) : u.delete(k)));
    u.set("view", "lista");
    u.delete("page");
    router.push(`${pathname}?${u.toString()}`);
  };
  return (
    <form
      className="flex flex-1 flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
    >
      <div className="w-full sm:w-56">
        <Input icon="search" placeholder="Nº do pedido ou cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="w-[calc(50%-4px)] sm:w-40">
        <Select value={sp.get("status") ?? ""} onChange={(e) => apply({ status: e.target.value })} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <div className="w-[calc(50%-4px)] sm:w-36">
        <Select value={sp.get("type") ?? ""} onChange={(e) => apply({ type: e.target.value })} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(ORDER_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <Input type="date" aria-label="De" className="w-[calc(50%-4px)] sm:w-40" value={sp.get("from") ?? ""} onChange={(e) => apply({ from: e.target.value })} />
      <Input type="date" aria-label="Até" className="w-[calc(50%-4px)] sm:w-40" value={sp.get("to") ?? ""} onChange={(e) => apply({ to: e.target.value })} />
      <Button type="submit" variant="secondary" icon="filter">Filtrar</Button>
      {(sp.get("q") || sp.get("status") || sp.get("type") || sp.get("from") || sp.get("to")) && (
        <Button variant="ghost" onClick={() => { setQ(""); router.push(`${pathname}?view=lista`); }}>Limpar</Button>
      )}
    </form>
  );
}

export function ExportOrdersButton() {
  const sp = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon="download"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const res = await exportOrdersAction({ status: sp.get("status") ?? undefined, type: sp.get("type") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, q: sp.get("q") ?? undefined });
        setBusy(false);
        if (!res.ok || !res.data) return toast.error(res.error ?? "Erro ao exportar");
        downloadCSV(
          `pedidos-${new Date().toISOString().slice(0, 10)}`,
          res.data.map((o: Record<string, unknown>) => ({
            ...o,
            created_at: new Date(String(o.created_at)).toLocaleString("pt-BR"),
            status: ORDER_STATUS[o.status as keyof typeof ORDER_STATUS]?.label,
            type: ORDER_TYPE[o.type as keyof typeof ORDER_TYPE]?.label,
            payment_method: PAYMENT_METHOD[o.payment_method as keyof typeof PAYMENT_METHOD],
          })),
          [
            { key: "number", label: "Pedido" }, { key: "created_at", label: "Data" }, { key: "status", label: "Status" }, { key: "type", label: "Tipo" },
            { key: "customer_name", label: "Cliente" }, { key: "customer_phone", label: "Telefone" }, { key: "subtotal", label: "Subtotal" },
            { key: "discount", label: "Desconto" }, { key: "delivery_fee", label: "Entrega" }, { key: "total", label: "Total" },
            { key: "payment_method", label: "Pagamento" }, { key: "payment_status", label: "Situação pagamento" }, { key: "coupon_code", label: "Cupom" },
            { key: "cancel_reason", label: "Motivo cancelamento" },
          ],
        );
        toast.success(`${res.data.length} pedidos exportados`);
      }}
    >
      Exportar CSV
    </Button>
  );
}
