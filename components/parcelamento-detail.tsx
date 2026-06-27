import { ParcelasTable } from "@/components/parcelas-table";
import { barColorClass, type PlanSummary } from "@/lib/parcelamento";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Corpo da página de detalhe de um parcelamento: painel de resumo (progresso,
 * próxima parcela, saldo) + a lista das parcelas. Reusado pelo admin e pelo
 * portal — a diferença é apenas o showPaid (marcar parcela como paga).
 */
export function ParcelamentoDetail({
  summary,
  parcelas,
  showPaid = false,
}: {
  summary: PlanSummary;
  parcelas: DocumentRow[];
  showPaid?: boolean;
}) {
  const { pagas, total, pct, proxima, saldoRestante, quitado, cor } = summary;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Progresso</div>
            <div className="text-2xl font-semibold tabular-nums">
              {pagas}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {total} parcelas
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Saldo restante</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(saldoRestante)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", barColorClass(cor))}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
            {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
        </div>

        <div className="mt-4 text-sm">
          {quitado ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              ✓ Parcelamento quitado
            </span>
          ) : proxima?.due_date ? (
            <span className="text-muted-foreground">
              Próxima parcela vence em{" "}
              <strong className="text-foreground tabular-nums">
                {formatDate(proxima.due_date)}
              </strong>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Nenhuma parcela em aberto.
            </span>
          )}
        </div>
      </div>

      <ParcelasTable parcelas={parcelas} total={total} showPaid={showPaid} />
    </div>
  );
}
