"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/hooks/use-action";
import { deleteCategoryAction, reorderCategoriesAction, saveCategoryAction } from "./actions";

interface Cat { id: string; name: string; description: string | null; is_active: boolean; sort: number; products: number }

export function CategoriesManager({ categories, canManage }: { categories: Cat[]; canManage: boolean }) {
  const [list, setList] = useState(categories);
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const { run, pending } = useAction();
  const confirm = useConfirm();
  useEffect(() => setList(categories), [categories]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    void run(() => reorderCategoriesAction(next.map((c) => c.id)), { refresh: false });
  };

  return (
    <>
      {canManage && <div className="mb-3 flex justify-end"><Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Nova categoria</Button></div>}
      {list.length === 0 ? (
        <EmptyState icon="folders" title="Nenhuma categoria" description="Crie categorias como Hambúrgueres, Smash, Combos e Bebidas." action={canManage && <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Criar categoria</Button>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              {canManage && (
                <div className="flex flex-col">
                  <IconButton icon="chevron-up" label="Subir" size="xs" disabled={i === 0 || pending} onClick={() => move(i, -1)} />
                  <IconButton icon="chevron-down" label="Descer" size="xs" disabled={i === list.length - 1 || pending} onClick={() => move(i, 1)} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.description || "Sem descrição"} · {c.products} produto(s)</p>
              </div>
              {!c.is_active && <Badge>Oculta</Badge>}
              {canManage && (
                <>
                  <Switch checked={c.is_active} label="Visível no cardápio" onChange={(v) => run(() => saveCategoryAction({ name: c.name, description: c.description, is_active: v }, c.id), { success: v ? "Categoria visível" : "Categoria oculta" })} />
                  <IconButton icon="edit" label="Editar" onClick={() => setEditing(c)} />
                  <IconButton
                    icon="trash"
                    label="Excluir"
                    className="text-ketchup-500"
                    onClick={async () => {
                      if (await confirm({ title: `Excluir "${c.name}"?`, description: "A categoria sai do cardápio. Produtos precisam ser movidos antes.", tone: "danger", confirmLabel: "Excluir" }))
                        void run(() => deleteCategoryAction(c.id), { success: "Categoria excluída" });
                    }}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <CategoryModal value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CategoryModal({ value, onClose }: { value: Cat | "new" | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const { run, pending } = useAction();
  useEffect(() => {
    if (value && value !== "new") {
      setName(value.name);
      setDescription(value.description ?? "");
      setActive(value.is_active);
    } else {
      setName("");
      setDescription("");
      setActive(true);
    }
  }, [value]);
  const save = () =>
    run(() => saveCategoryAction({ name, description, is_active: active }, value && value !== "new" ? value.id : null), { success: "Categoria salva", onSuccess: onClose });
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={value === "new" ? "Nova categoria" : "Editar categoria"} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="dark" loading={pending} onClick={save}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Nome" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Smash" /></Field>
        <Field label="Descrição" help="Aparece abaixo do título no cardápio"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">Visível no cardápio <Switch checked={active} onChange={setActive} /></label>
      </form>
    </Modal>
  );
}
