import type { ReactNode } from "react";
import type { Tone } from "@/lib/dates";
import { cn } from "@/lib/utils";

const toneStyles: Record<Tone, string> = {
  danger:
    "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300",
  warning:
    "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300",
  info: "bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300",
  success:
    "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
  muted: "bg-muted text-foreground ring-border",
};

export function AlertBanner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset",
        toneStyles[tone],
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <div>{children}</div>
    </div>
  );
}
