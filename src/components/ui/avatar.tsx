import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PALETTE = ["bg-ember-100 text-ember-700", "bg-mustard-100 text-mustard-700", "bg-pickle-100 text-pickle-700", "bg-blueberry-100 text-blueberry-700", "bg-grape-100 text-grape-700"];

export function Avatar({ name, src, size = 32, className }: { name: string | null | undefined; src?: string | null; size?: number; className?: string }) {
  const idx = Math.abs([...(name ?? "?")].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length;
  if (src) return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-md object-cover", className)} style={{ width: size, height: size }} />;
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md font-semibold", PALETTE[idx], className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}
