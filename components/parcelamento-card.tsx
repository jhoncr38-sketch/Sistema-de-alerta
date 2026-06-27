import Link from "next/link";
import { Calendar, ChevronRight, Wallet } from "lucide-react";
import { ProgressRing } from "@/components/progress-ring";
import { ParcelamentoStatusBadge } from "@/components/parcelamento-status-badge";
import { formaPagamentoLabel, type PlanSummary } from "@/lib/parcelamento";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Texto + cor do "vence em X dias" a partir dos dias até o vencimento. */
export function vencimentoInfo(dias: number | null): {
  text: string;
  className: string;
} {
  if (dias === null) return { text: "—", className: "text-muted-foreground" };
  if (dias < 0) {
    const n = Math.abs(dias);
    return {
      text: `Vencida há ${n} ${n === 1 ? "dia" : "dias"}`,
      className: "text-red-600 dark:text-red-400",
    };
  }
  if (dias === 0) {
    return { text: "Vence hoje", className: "text-amber-600 dark:text-amber-400" };
  }
  return {
    text: `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`,
    className:
      dias <= 3
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400",
  };
}

/**
 * Card de um parcelamento: selo de status, anel de progresso, contagem de
 * parcelas, próxima parcela e valor/forma de pagamento.
 */
export function ParcelamentoCard({
  nome,
  href,
  summary,
  companyName,
  formaPagamento,
}: {
  nome: string;
  href: string;
  summary: PlanSummary;
  /** Só nas telas do contador: nome do cliente dono do parcelamento. */
  companyName?: string;
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
    <Link
      href={href}
      className="group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-center justify-between gap-2">
        <ParcelamentoStatusBadge status={status} />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3 min-w-0">
        {companyName ? (
          <div className="truncate text-xs text-muted-foreground">
            {companyName}
          </div>
        ) : null}
        <h3 className="truncate font-semibold leading-tight">{nome}</h3>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <ProgressRing pct={pct} cor={cor} />
        <div className="min-w-0">
          <div className="text-sm font-medium tabular-nums">
            {pagas} / {total}{" "}
            <span className="font-normal text-muted-foreground">pagas</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {quitado
              ? "Todas as parcelas quitadas"
              : `Restam ${restantes} ${restantes === 1 ? "parcela" : "parcelas"}`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="size-3" />
            {quitado ? "Última parcela" : "Próxima parcela"}
          </div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">
            {dataRef ? formatDate(dataRef) : "—"}
          </div>
          <div
            className={cn(
              "mt-0.5 text-[11px] font-medium",
              quitado ? "text-emerald-600 dark:text-emerald-400" : venc.className,
            )}
          >
            {quitado ? "Quitado" : venc.text}
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wallet className="size-3" />
            Valor da parcela
          </div>
          <div className="mt-0.5 text-sm font-medium tabular-nums">
            {valorParcela != null ? formatCurrency(valorParcela) : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formaPagamentoLabel(formaPagamento)}
          </div>
        </div>
      </div>
    </Link>
  );
}
