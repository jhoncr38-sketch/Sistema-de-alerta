import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { barColorClass, type PlanSummary } from "@/lib/parcelamento";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Card de um parcelamento (o "miolo" da aba Parcelamentos).
 * Mostra progresso, % concluída, próxima parcela e saldo restante.
 */
export function ParcelamentoCard({
  nome,
  href,
  summary,
  companyName,
}: {
  nome: string;
  href: string;
  summary: PlanSummary;
  /** Só nas telas do contador: nome do cliente dono do parcelamento. */
  companyName?: string;
}) {
  const { pagas, total, pct, proxima, saldoRestante, quitado, cor } = summary;

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {companyName ? (
            <div className="truncate text-xs text-muted-foreground">
              {companyName}
            </div>
          ) : null}
          <h3 className="truncate font-semibold leading-tight">{nome}</h3>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-1 text-sm text-muted-foreground tabular-nums">
        {quitado ? (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Quitado · {total}/{total} parcelas
          </span>
        ) : (
          <>
            {pagas}/{total} parcelas
          </>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", barColorClass(cor))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </span>
      </div>

      {/* Rodapé: próxima parcela + saldo restante */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Próxima parcela</div>
          <div className="mt-0.5 font-medium tabular-nums">
            {proxima?.due_date ? formatDate(proxima.due_date) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground">Saldo restante</div>
          <div className="mt-0.5 font-medium tabular-nums">
            {formatCurrency(saldoRestante)}
          </div>
        </div>
      </div>
    </Link>
  );
}
