import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { Tone } from "@/lib/dates";
import { cn } from "@/lib/utils";

const valueTone: Record<Tone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-blue-600 dark:text-blue-400",
  success: "text-emerald-600 dark:text-emerald-400",
  muted: "text-foreground",
};

// Caixa tonal que envolve o ícone, casando com a cor do valor.
const iconTone: Record<Tone, string> = {
  danger: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  success:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  sub,
  tone = "muted",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="gap-2.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3 px-4">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
              iconTone[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="px-4">
        <div className={cn("text-2xl font-semibold tabular-nums", valueTone[tone])}>
          {value}
        </div>
        {sub ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </div>
    </Card>
  );
}
