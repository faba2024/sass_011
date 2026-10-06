import { notFound } from "next/navigation";
import { modLabel } from "@/components/orders/order-items";
import { requirePage } from "@/lib/auth";
import { ORDER_TYPE, PAYMENT_METHOD } from "@/lib/constants";
import { dateTime, money, phone } from "@/lib/format";
import { fetchOrder } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { PrintTrigger } from "./print-trigger";

export const metadata = { title: "Impressão" };

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ w?: string; via?: string }> }) {
  const ctx = await requirePage("orders.view");
  const { id } = await params;
  const sp = await searchParams;
  const width = sp.w === "58" ? 58 : 80;
  const kitchen = sp.via === "cozinha";
  const supabase = await createClient();
  const order = await fetchOrder(supabase, ctx.org.id, id);
  if (!order) notFound();
  const { data: table } = order.table_id ? await supabase.from("dining_tables").select("label").eq("id", order.table_id).maybeSingle() : { data: null };
  const org = ctx.org;
  const small = width === 58;

  return (
    <div className="min-h-dvh bg-sunken py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${width}mm auto; margin: 0; } @media print { body { width: ${width}mm; } }`}</style>
      <PrintTrigger width={width} kitchen={kitchen} />
      <div className="mx-auto bg-white px-[3mm] py-[4mm] font-mono text-black shadow-pop print:shadow-none" style={{ width: `${width}mm`, fontSize: small ? "10px" : "12px", lineHeight: 1.35 }}>
        <div className="text-center">
          {org.logo_url && !kitchen && <img src={org.logo_url} alt="" className="mx-auto mb-1 h-12 w-12 object-contain grayscale" />}
          <p className="font-bold uppercase" style={{ fontSize: small ? "12px" : "14px" }}>{org.name}</p>
          {!kitchen && org.phone && <p>{phone(org.phone)}</p>}
          {!kitchen && org.cnpj && <p>CNPJ {org.cnpj}</p>}
        </div>
        <p className="my-1.5 border-t border-dashed border-black" />
        <div className="flex justify-between font-bold" style={{ fontSize: small ? "14px" : "18px" }}>
          <span>#{order.number}</span>
          <span>{kitchen ? "COZINHA" : ORDER_TYPE[order.type].short.toUpperCase()}</span>
        </div>
        <p>{dateTime(order.created_at, org.timezone)}</p>
        {table?.label && <p className="font-bold">{table.label}</p>}
        {order.scheduled_for && <p className="font-bold">AGENDADO: {dateTime(order.scheduled_for, org.timezone)}</p>}
        <p className="mt-1 font-bold">{order.customer_name}</p>
        {!kitchen && order.customer_phone && <p>{phone(order.customer_phone)}</p>}
        {!kitchen && order.address && (
          <div className="mt-0.5">
            <p>{order.address.street}, {order.address.number}</p>
            {order.address.complement && <p>{order.address.complement}</p>}
            <p>{order.address.district}{order.address.city ? ` - ${order.address.city}` : ""}</p>
            {order.address.reference && <p>Ref: {order.address.reference}</p>}
          </div>
        )}
        <p className="my-1.5 border-t border-dashed border-black" />
        {order.order_items.map((it) => (
          <div key={it.id} className="mb-1.5">
            <div className="flex justify-between gap-2 font-bold">
              <span>{it.quantity}x {it.product_name.toUpperCase()}</span>
              {!kitchen && <span className="whitespace-nowrap">{money(it.total)}</span>}
            </div>
            {it.order_item_modifiers.map((m) => (
              <p key={m.id} className="pl-[3mm]">{m.group_kind === "removal" ? "** " : ""}{modLabel(m).toUpperCase()}{m.group_kind === "removal" ? " **" : ""}</p>
            ))}
            {it.notes && <p className="pl-[3mm] font-bold">OBS: {it.notes}</p>}
          </div>
        ))}
        {order.notes && (
          <>
            <p className="my-1.5 border-t border-dashed border-black" />
            <p className="font-bold">OBSERVAÇÃO: {order.notes}</p>
          </>
        )}
        {!kitchen && (
          <>
            <p className="my-1.5 border-t border-dashed border-black" />
            <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {Number(order.delivery_fee) > 0 && <div className="flex justify-between"><span>Entrega</span><span>{money(order.delivery_fee)}</span></div>}
            {Number(order.discount) > 0 && <div className="flex justify-between"><span>Desconto{order.coupon_code ? ` ${order.coupon_code}` : ""}</span><span>-{money(order.discount)}</span></div>}
            <div className="flex justify-between font-bold" style={{ fontSize: small ? "13px" : "16px" }}><span>TOTAL</span><span>{money(order.total)}</span></div>
            <p className="mt-1">Pagamento: {PAYMENT_METHOD[order.payment_method]} {order.payment_status === "paid" ? "(PAGO)" : "(A RECEBER)"}</p>
            {order.payment_method === "cash" && order.change_for && (
              <p className="font-bold">Troco p/ {money(order.change_for)}: {money(Number(order.change_for) - Number(order.total))}</p>
            )}
          </>
        )}
        <p className="my-1.5 border-t border-dashed border-black" />
        <p className="text-center" style={{ fontSize: "9px" }}>TOP BURGER OS</p>
      </div>
    </div>
  );
}
