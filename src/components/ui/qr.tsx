"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** QR Code gerado no navegador (PNG em alta resolução para impressão) */
export function useQr(text: string, size = 1024) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1511", light: "#ffffff" } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src;
}

export function QrImage({ text, className, label }: { text: string; className?: string; label?: string }) {
  const src = useQr(text);
  return src ? <img src={src} alt={label ?? `QR Code: ${text}`} className={cn("aspect-square", className)} /> : <div className={cn("skeleton aspect-square", className)} />;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
