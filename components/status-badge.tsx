import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Minus,
} from "lucide-react";
import { getUrgency, type Tone } from "@/lib/dates";
import type { DocStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const toneStyles: Record<Tone, string> = {
  danger:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-400",
  warning:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400",
  info: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-400",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground ring-border",
};

const toneIcon = {
  danger: AlertCircle,
  warning: Clock,
  info: CalendarClock,
  success: CheckCircle2,
  muted: Minus,
};

export function StatusBadge({
  dueDate,
  status = "open",
}: {
  dueDate: string | Date;
  status?: DocStatus;
}) {
  const info = getUrgency(dueDate, status);
  const Icon = toneIcon[info.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneStyles[info.tone],
      )}
    >
      <Icon className="size-3" />
      {info.label}
    </span>
  );
}
