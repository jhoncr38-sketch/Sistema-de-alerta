import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { docTypeLabel } from "@/lib/constants";
import { getUrgency, type Tone } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Rótulo da guia: parcela mostra "Parcela N"; o resto, o tipo. */
function tipoLabel(d: DocumentWithCompany): string {
  if (d.categoria === "parcelamento" && d.parcela_num) {
    return `Parcela ${d.parcela_num}`;
  }
  return docTypeLabel(d.type);
}

const toneCard: Record<Tone, string> = {
  danger: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
  warning:
    "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  info: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
  success:
    "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
  muted: "border-border bg-card",
};

const toneText: Record<Tone, string> = {
  danger: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-blue-700 dark:text-blue-400",
  success: "text-emerald-700 dark:text-emerald-400",
  muted: "text-muted-foreground",
};

/**
 * Cartão em destaque com a conta de vencimento mais próximo — é a primeira coisa
 * que o cliente vê no portal. Sem nada em aberto, mostra um estado "em dia".
 */
export function ProximoVencimento({ open }: { open: DocumentWithCompany[] }) {
  const comData = open.filter((d) => d.due_date);

  if (comData.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
            Você está em dia!
          </div>
          <div className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
            Nenhuma conta em aberto no momento.
          </div>
        </div>
      </div>
    );
  }

  // Guia de vencimento mais próximo (menor due_date).
  const next = comData.reduce((a, b) =>
    (a.due_date as string) <= (b.due_date as string) ? a : b,
  );
  const { label, tone } = getUrgency(next.due_date as string, next.status);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between",
        toneCard[tone],
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <DocTypeIcon doc={next} className="size-11 rounded-xl [&_svg]:size-5" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Próximo vencimento
          </div>
          <div className="truncate font-semibold">{tipoLabel(next)}</div>
          <div className={cn("text-sm font-medium", toneText[tone])}>
            {label} · {formatDate(next.due_date as string)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        {next.amount != null ? (
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(next.amount)}
          </div>
        ) : null}
        {next.file_path ? (
          <Button
            nativeButton={false}
            render={
              <a href={`/api/documents/${next.id}/download`}>
                <Download />
                Baixar
              </a>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
