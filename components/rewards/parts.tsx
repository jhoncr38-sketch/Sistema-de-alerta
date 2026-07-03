import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cabeçalho de seção: título discreto à esquerda, ação opcional à direita. */
export function SectionHeading({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="font-heading text-sm font-semibold">{title}</h2>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}

const BAR_TONE = {
  primary: "bg-primary",
  gold: "bg-gradient-to-r from-amber-400 to-amber-500",
  emerald: "bg-emerald-500",
} as const;

/** Barra de progresso linear com transição suave. */
export function ProgressBar({
  pct,
  tone = "primary",
  className,
}: {
  pct: number;
  tone?: keyof typeof BAR_TONE;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          BAR_TONE[tone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
