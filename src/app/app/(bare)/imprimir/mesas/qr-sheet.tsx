"use client";
import { QrImage } from "@/components/ui/qr";

export function QrSheet({ orgName, logo, items }: { orgName: string; logo: string | null; items: { id: string; label: string; url: string }[] }) {
  return (
    <div className="min-h-dvh bg-sunken p-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
        <p className="text-sm text-muted">{items.length} mesa(s) · recorte e cole em cada mesa</p>
        <button type="button" onClick={() => window.print()} className="h-9 rounded-md bg-ember-500 px-4 text-sm font-medium text-white">Imprimir</button>
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 print:max-w-none print:gap-0 sm:grid-cols-3">
        {items.map((t) => (
          <div key={t.id} className="break-inside-avoid rounded-xl border-2 border-dashed border-line-strong bg-white p-5 text-center print:rounded-none">
            {logo && <img src={logo} alt="" className="mx-auto h-10 w-10 object-contain" />}
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{orgName}</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{t.label}</p>
            <QrImage text={t.url} className="mx-auto mt-3 w-40" label={`QR ${t.label}`} />
            <p className="mt-3 text-sm font-semibold">Aponte a câmera e peça pelo celular</p>
            <p className="text-[11px] text-muted">O pedido vai direto para a cozinha</p>
          </div>
        ))}
      </div>
    </div>
  );
}
