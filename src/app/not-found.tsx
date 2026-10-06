import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-sm text-center">
        <LogoMark size={40} className="mx-auto" />
        <p className="num mt-6 font-mono text-sm text-muted">ERRO 404</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Essa página saiu do cardápio</h1>
        <p className="mt-2 text-sm text-muted">O endereço não existe ou foi alterado.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-white hover:bg-char-700">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
