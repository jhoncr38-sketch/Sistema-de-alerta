import { ParcelasTable } from "@/components/parcelas-table";
import { ProgressRing } from "@/components/progress-ring";
import { ParcelamentoStatusBadge } from "@/components/parcelamento-status-badge";
import { vencimentoInfo } from "@/components/parcelamento-card";
import { formaPagamentoLabel, type PlanSummary } from "@/lib/parcelamento";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Corpo da página de detalhe de um parcelamento: painel de resumo (anel de
 * progresso, status, próxima parcela, valor e forma de pagamento) + a lista das
 * parcelas. Reusado pelo admin e pelo portal — a diferença é o showPaid.
 */
export function ParcelamentoDetail({
  summary,
  parcelas,
  showPaid = false,
  formaPagamento,
}: {
  summary: PlanSummary;
  parcelas: DocumentRow[];
  showPaid?: boolean;
  /** "boleto" | "debito_automatico" — define o rótulo "Forma de pagamento". */
  formaPagamento?: string;
}) {
  const {
    pagas,
    total,
    pct,
    restantes,
    proxima,
    ultima,
    valorParcela,
    diasParaVencer,
    quitado,
    status,
    cor,
  } = summary;

  const venc = vencimentoInfo(diasParaVencer);
  const dataRef = quitado ? ultima?.due_date : proxima?.due_date;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex items-center gap-4">
            <ProgressRing pct={pct} cor={cor} size={84} stroke={7} />
            <div>
              <ParcelamentoStatusBadge status={status} />
              <div className="mt-2 text-xl font-semibold tabular-nums">
                {pagas}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {total} pagas
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {quitado
                  ? "Todas as parcelas quitadas"
                  : `Restam ${restantes} ${restantes === 1 ? "parcela" : "parcelas"}`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">
                {quitado ? "Última parcela" : "Próxima parcela"}
              </div>
              <div className="mt-0.5 text-sm font-medium tabular-nums">
                {dataRef ? formatDate(dataRef) : "—"}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-xs font-medium",
                  quitado
                    ? "text-emerald-600 dark:text-emerald-400"
                    : venc.className,
                )}
              >
                {quitado ? "Quitado" : venc.text}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">
                Valor da parcela
              </div>
              <div className="mt-0.5 text-sm font-medium tabular-nums">
                {valorParcela != null ? formatCurrency(valorParcela) : "—"}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">
                Forma de pagamento
              </div>
              <div className="mt-0.5 text-sm font-medium">
                {formaPagamentoLabel(formaPagamento)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ParcelasTable
        parcelas={parcelas}
        total={total}
        showPaid={showPaid}
        debitoAutomatico={formaPagamento === "debito_automatico"}
      />
    </div>
  );
}
