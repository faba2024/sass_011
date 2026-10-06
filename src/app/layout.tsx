import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { env } from "@/lib/env";
import "./globals.css";

/**
 * Fontes do sistema:
 * Não usamos `next/font/google` aqui de propósito. Em alguns builds da Vercel,
 * o loader do Google Fonts pode falhar durante a compilação e derrubar todo o
 * deploy. A pilha de fontes abaixo é 100% local/sistema, rápida e confiável.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "TOP BURGER OS — o sistema da sua hamburgueria", template: "%s · TOP BURGER OS" },
  description: "Pedidos online, cozinha, delivery, caixa, estoque com ficha técnica, financeiro e fidelidade em um só sistema feito para hamburguerias.",
  applicationName: "TOP BURGER OS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
