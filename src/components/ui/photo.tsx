import Image from "next/image";
import { normalizeSupabaseUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

const SUPABASE_HOST = (() => {
  try {
    return new URL(normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)).hostname;
  } catch {
    return "";
  }
})();

/** Só otimiza (AVIF/WebP responsivo) o que vem do Storage ou de /public; SVG é vetorial e já é nítido. */
function canOptimize(src: string) {
  if (src.endsWith(".svg")) return false;
  if (src.startsWith("/")) return true;
  try {
    return new URL(src).hostname === SUPABASE_HOST;
  } catch {
    return false;
  }
}

/**
 * Foto de produto/loja. Usa next/image com `sizes` para servir o arquivo certo
 * para cada densidade de tela (1x, 2x Retina, 4K) sem baixar arquivos gigantes.
 */
export function Photo({ src, alt, sizes, className, priority, fill = true, width, height, rounded = true }: { src: string | null | undefined; alt: string; sizes: string; className?: string; priority?: boolean; fill?: boolean; width?: number; height?: number; rounded?: boolean }) {
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-sunken text-faint", rounded && "rounded-md", className)} aria-label={alt}>
        <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <path d="M4 10a8 5.5 0 0 1 16 0z" />
          <path d="M3.5 13.5h17" />
          <path d="M4.5 16.5h15a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" />
        </svg>
      </div>
    );
  }
  const unoptimized = !canOptimize(src);
  if (fill) {
    return (
      <div className={cn("relative overflow-hidden bg-sunken", rounded && "rounded-md", className)}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={unoptimized} quality={82} className="object-cover" />
      </div>
    );
  }
  return <Image src={src} alt={alt} width={width ?? 400} height={height ?? 400} sizes={sizes} priority={priority} unoptimized={unoptimized} quality={82} className={cn("object-cover", rounded && "rounded-md", className)} />;
}
