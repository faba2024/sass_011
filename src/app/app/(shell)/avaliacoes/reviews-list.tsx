"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { replyReviewAction, toggleReviewHiddenAction } from "./actions";

export interface Review { id: string; rating: number; comment: string | null; reply: string | null; replied_at: string | null; is_hidden: boolean; created_at: string; customer_name: string | null; customer_id: string | null; order: { id: string; number: number } | null }

export function ReviewsList({ reviews, tz }: { reviews: Review[]; tz: string }) {
  const [filter, setFilter] = useState("all");
  const visible = reviews.filter((r) => !r.is_hidden);
  const avg = visible.length ? visible.reduce((a, r) => a + r.rating, 0) / visible.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: visible.filter((r) => r.rating === n).length }));
  const list = reviews.filter((r) => filter === "all" || (filter === "low" ? r.rating <= 3 : filter === "pending" ? !r.reply && r.comment : r.is_hidden));
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="self-start">
        <p className="text-xs text-muted">Nota média</p>
        <p className="num font-display text-4xl font-bold">{avg ? avg.toFixed(1).replace(".", ",") : "—"}</p>
        <p className="text-mustard-500">{"★".repeat(Math.round(avg))}<span className="text-line-strong">{"★".repeat(5 - Math.round(avg))}</span></p>
        <p className="mt-1 text-xs text-muted">{visible.length} avaliação(ões) visível(is)</p>
        <ul className="mt-4 space-y-1.5">
          {dist.map((d) => (
            <li key={d.n} className="flex items-center gap-2 text-xs">
              <span className="num w-3">{d.n}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-mustard-400" style={{ width: `${visible.length ? (d.c / visible.length) * 100 : 0}%` }} /></div>
              <span className="num w-6 text-right text-muted">{d.c}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div>
        <Segmented className="mb-3" value={filter} onChange={setFilter} items={[{ value: "all", label: "Todas" }, { value: "pending", label: "Sem resposta" }, { value: "low", label: "Notas baixas" }, { value: "hidden", label: "Ocultas" }]} />
        {list.length === 0 ? <EmptyState icon="chat-star" title="Nenhuma avaliação aqui" description="Clientes avaliam pela página de acompanhamento depois que o pedido é concluído." /> : (
          <div className="space-y-3">{list.map((r) => <ReviewCard key={r.id} r={r} tz={tz} />)}</div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ r, tz }: { r: Review; tz: string }) {
  const { run, pending } = useAction();
  const [reply, setReply] = useState(r.reply ?? "");
  const [open, setOpen] = useState(false);
  return (
    <Card className={cn(r.is_hidden && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-mustard-500">{"★".repeat(r.rating)}<span className="text-line-strong">{"★".repeat(5 - r.rating)}</span></p>
          <p className="text-[13px] font-medium">{r.customer_id ? <Link href={`/app/clientes/${r.customer_id}`} className="hover:text-ember-600">{r.customer_name}</Link> : r.customer_name}</p>
          <p className="text-xs text-muted">{dateTime(r.created_at, tz)}{r.order && <> · <Link href={`/app/pedidos/${r.order.id}`} className="hover:underline">pedido #{r.order.number}</Link></>}</p>
        </div>
        <div className="flex gap-1.5">
          {r.is_hidden && <Badge>Oculta</Badge>}
          <Button size="xs" variant="ghost" onClick={() => run(() => toggleReviewHiddenAction(r.id, !r.is_hidden), { success: r.is_hidden ? "Avaliação visível" : "Avaliação ocultada" })}>{r.is_hidden ? "Mostrar" : "Ocultar"}</Button>
        </div>
      </div>
      {r.comment && <p className="mt-2 text-[14px] text-ink-2">“{r.comment}”</p>}
      {r.reply && !open && <p className="mt-3 rounded-md bg-paper px-3 py-2 text-[13px]"><b>Resposta:</b> {r.reply}</p>}
      {open ? (
        <div className="mt-3">
          <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Agradeça ou explique o que aconteceu" />
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button size="sm" variant="dark" loading={pending} onClick={() => run(() => replyReviewAction(r.id, reply), { success: "Resposta publicada", onSuccess: () => setOpen(false) })}>Publicar resposta</Button></div>
        </div>
      ) : (
        <Button size="sm" className="mt-3" icon="send" onClick={() => setOpen(true)}>{r.reply ? "Editar resposta" : "Responder"}</Button>
      )}
    </Card>
  );
}
