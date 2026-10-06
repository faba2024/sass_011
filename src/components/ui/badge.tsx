import type { ReactNode } from "react";
import type { Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  ember: "bg-ember-50 text-ember-700 ring-ember-100",
  mustard: "bg-mustard-50 text-mustard-700 ring-mustard-100",
  green: "bg-pickle-50 text-pickle-700 ring-pickle-100",
  red: "bg-ketchup-50 text-ketchup-700 ring-ketchup-100",
  blue: "bg-blueberry-50 text-blueberry-700 ring-blueberry-100",
  violet: "bg-grape-50 text-grape-700 ring-grape-100",
};
const DOTS: Record<Tone, string> = {
  neutral: "bg-faint",
  ember: "bg-ember-500",
  mustard: "bg-mustard-500",
  green: "bg-pickle-500",
  red: "bg-ketchup-500",
  blue: "bg-blueberry-500",
  violet: "bg-grape-500",
};

export function Badge({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", DOTS[tone], pulse && "animate-pulse-ring")} />;
}
