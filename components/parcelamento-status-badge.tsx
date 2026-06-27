import { CheckCircle2 } from "lucide-react";
import type { PlanStatus } from "@/lib/parcelamento";
import { cn } from "@/lib/utils";

const META: Record<PlanStatus, { label: string; dot: string; badge: string }> = {
  em_dia: {
    label: "Em dia",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  },
  atencao: {
    label: "Atenção",
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  },
  vencida: {
    label: "Vencida",
    dot: "bg-red-500",
    badge:
      "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  },
  quitado: {
    label: "Quitado",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  },
};

/** Selo de situação do parcelamento (Em dia / Atenção / Vencida / Quitado). */
export function ParcelamentoStatusBadge({
  status,
  className,
}: {
  status: PlanStatus;
  className?: string;
}) {
  const m = META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        m.badge,
        className,
      )}
    >
      {status === "quitado" ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <span className={cn("size-2 rounded-full", m.dot)} />
      )}
      {m.label}
    </span>
  );
}
