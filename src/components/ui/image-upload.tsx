"use client";
import { useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { cn, uid } from "@/lib/utils";
import { Icon } from "./icons";
import { Spinner } from "./spinner";
import { useToast } from "./toast";

/** Reduz para no máx. `maxSize` px e converte para WebP (fotos nítidas em 4K, arquivo leve). */
async function optimize(file: File, maxSize: number): Promise<Blob> {
  if (file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  return blob ?? file;
}

export async function uploadOrgImage(orgId: string, folder: string, file: File, maxSize = 2000) {
  if (!file.type.startsWith("image/")) throw new Error("Envie um arquivo de imagem");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 15 MB)");
  const blob = await optimize(file, maxSize);
  const ext = blob.type === "image/svg+xml" ? "svg" : blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() ?? "jpg");
  const path = `${orgId}/${folder}/${uid()}.${ext}`;
  const supabase = getBrowserClient();
  const { error } = await supabase.storage.from("org-assets").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("org-assets").getPublicUrl(path).data.publicUrl;
}

export function ImageUpload({ orgId, folder, value, onChange, aspect = "square", label = "Enviar imagem", maxSize, className }: { orgId: string; folder: string; value: string | null; onChange: (url: string | null) => void; aspect?: "square" | "wide" | "banner"; label?: string; maxSize?: number; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const toast = useToast();
  const ratio = { square: "aspect-square", wide: "aspect-[4/3]", banner: "aspect-[3/1]" }[aspect];

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadOrgImage(orgId, folder, file, maxSize ?? (aspect === "banner" ? 2560 : 2000)));
    } catch (e) {
      toast.error("Falha no envio", (e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-dashed bg-sunken/60", drag ? "border-ember-500 bg-ember-50" : "border-line-strong", ratio, className)}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files?.[0]); }}
    >
      {value ? (
        <>
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-char-950/60 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-ink shadow">Trocar</button>
            <button type="button" onClick={() => onChange(null)} className="rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-ketchup-500 shadow">Remover</button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center text-muted hover:text-ink">
          <Icon name="upload" size={20} />
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[11px] text-faint">JPG, PNG, WebP · convertido para WebP</span>
        </button>
      )}
      {busy && (
        <div className="absolute inset-0 grid place-items-center bg-surface/80">
          <Spinner size={22} />
        </div>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}
