"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, MoneyInput } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { money } from "@/lib/format";
import { deleteZoneAction, reorderZonesAction, saveZoneAction } from "./actions";

export interface Zone { id: string; name: string; zip_prefixes: string[]; fee: number; min_order: number; eta_min: number; eta_max: number; is_active: boolean; sort: number }

export function ZonesManager({ zones, orders30d }: { zones: Zone[]; orders30d: Record<string, number> }) {
  const [list, setList] = useState(zones);
  const [editing, setEditing] = useState<Zone | "new" | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();
  useEffect(() => setList(zones), [zones]);
  const move = (i: number, d: -1 | 1) => {
    const n = [...list];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setList(n);
    void run(() => reorderZonesAction(n.map((z) => z.id)), { refresh: false });
  };
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Nova área</Button></div>
      {list.length === 0 ? (
        <EmptyState icon="map-pin" title="Nenhuma área de entrega" description="Sem áreas cadastradas o cliente só consegue pedir para retirada ou consumo no local." action={<Button variant="primary" onClick={() => setEditing("new")}>Cadastrar área</Button>} />
      ) : (
        <Table>
          <thead><tr><Th /><Th>Área</Th><Th>CEPs</Th><Th align="right">Taxa</Th><Th align="right">Pedido mín.</Th><Th>Tempo</Th><Th align="right">Pedidos 30d</Th><Th>Ativa</Th><Th /></tr></thead>
          <tbody>
            {list.map((z, i) => (
              <tr key={z.id}>
                <Td className="w-14"><div className="flex"><IconButton icon="chevron-up" label="Subir" size="xs" disabled={i === 0} onClick={() => move(i, -1)} /><IconButton icon="chevron-down" label="Descer" size="xs" disabled={i === list.length - 1} onClick={() => move(i, 1)} /></div></Td>
                <Td className="font-medium">{z.name}</Td>
                <Td className="text-xs text-muted">{z.zip_prefixes.length ? z.zip_prefixes.join(", ") : "Por nome do bairro"}</Td>
                <Td align="right" className="num">{Number(z.fee) === 0 ? <Badge tone="green">Grátis</Badge> : money(z.fee)}</Td>
                <Td align="right" className="num">{Number(z.min_order) ? money(z.min_order) : "—"}</Td>
                <Td className="num">{z.eta_min}–{z.eta_max} min</Td>
                <Td align="right" className="num">{orders30d[z.id] ?? 0}</Td>
                <Td><Switch size="sm" checked={z.is_active} label="Ativa" onChange={(v) => run(() => saveZoneAction({ ...z, is_active: v }, z.id), { success: v ? "Área ativada" : "Área desativada" })} /></Td>
                <Td align="right">
                  <div className="flex justify-end">
                    <IconButton icon="edit" label="Editar" size="sm" onClick={() => setEditing(z)} />
                    <IconButton icon="trash" label="Excluir" size="sm" className="text-ketchup-500" onClick={async () => { if (await confirm({ title: `Excluir ${z.name}?`, tone: "danger", confirmLabel: "Excluir" })) void run(() => deleteZoneAction(z.id), { success: "Área excluída" }); }} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ZoneModal value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ZoneModal({ value, onClose }: { value: Zone | "new" | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ name: "", zips: "", fee: 0, min_order: 0, eta_min: 35, eta_max: 50, is_active: true });
  useEffect(() => {
    if (value && value !== "new") setF({ name: value.name, zips: value.zip_prefixes.join(", "), fee: Number(value.fee), min_order: Number(value.min_order), eta_min: value.eta_min, eta_max: value.eta_max, is_active: value.is_active });
    else setF({ name: "", zips: "", fee: 0, min_order: 0, eta_min: 35, eta_max: 50, is_active: true });
  }, [value]);
  const save = () =>
    run(() => saveZoneAction({ name: f.name, zip_prefixes: f.zips.split(/[,\s;]+/).map((z) => z.replace(/\D/g, "")).filter(Boolean), fee: f.fee, min_order: f.min_order, eta_min: f.eta_min, eta_max: f.eta_max, is_active: f.is_active }, value && value !== "new" ? value.id : null), { success: "Área salva", onSuccess: onClose });
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Nova área de entrega" : "Editar área"} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bairro ou área" required className="sm:col-span-2" help="Se o cliente digitar este nome no bairro, a área é selecionada sozinha."><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Centro" /></Field>
        <Field label="Prefixos de CEP" className="sm:col-span-2" help="Opcional. Ex.: 40010, 40020 — valida o CEP do cliente."><Input value={f.zips} onChange={(e) => setF({ ...f, zips: e.target.value })} placeholder="40010, 40020" /></Field>
        <Field label="Taxa de entrega"><MoneyInput value={f.fee} onChange={(v) => setF({ ...f, fee: v ?? 0 })} /></Field>
        <Field label="Pedido mínimo"><MoneyInput value={f.min_order} onChange={(v) => setF({ ...f, min_order: v ?? 0 })} /></Field>
        <Field label="Tempo mínimo" hint="min"><Input type="number" min={0} value={f.eta_min} onChange={(e) => setF({ ...f, eta_min: Number(e.target.value) })} /></Field>
        <Field label="Tempo máximo" hint="min"><Input type="number" min={0} value={f.eta_max} onChange={(e) => setF({ ...f, eta_max: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}
