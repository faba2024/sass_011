import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="grain relative hidden overflow-hidden bg-char-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" aria-label="Início">
          <Logo dark />
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.02em]">
            Da comanda à chapa, <span className="text-mustard-400">sem papel voando.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-char-200">
            Pedido online, cozinha, entrega, caixa, estoque por ficha técnica e fidelidade — conectados em tempo real.
          </p>
        </div>
        <div className="relative">
          <div className="ticket-edge w-72 rotate-[-3deg] bg-[#fffdf8] px-5 py-5 font-mono text-[12px] text-ink shadow-pop">
            <div className="flex justify-between">
              <span className="font-bold">#1058</span>
              <span>20:41</span>
            </div>
            <div className="rule-dashed my-2.5" />
            <p className="font-bold">2x LEVI ESPECIAL</p>
            <p className="pl-3 text-ink-2">- sem cebola</p>
            <p className="pl-3 text-ink-2">+ bacon extra</p>
            <p className="mt-1 font-bold">1x BATATA CHEDDAR</p>
            <div className="rule-dashed my-2.5" />
            <div className="flex justify-between font-bold">
              <span>ENTREGA · PIX</span>
              <span>R$ 77,80</span>
            </div>
          </div>
          <p className="mt-6 text-xs text-char-400">© {new Date().getFullYear()} TOP BURGER OS</p>
        </div>
      </aside>
      <main className="flex min-h-dvh flex-col bg-paper px-5 py-8 sm:px-10">
        <Link href="/" className="lg:hidden" aria-label="Início">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
