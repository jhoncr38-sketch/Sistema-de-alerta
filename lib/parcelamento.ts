import { getUrgency } from "@/lib/dates";
import type { DocumentRow } from "@/lib/types";

export type BarColor = "green" | "amber" | "red";

/** Campos mínimos de uma parcela para o resumo (a lista não precisa do resto). */
export type ParcelaLike = Pick<DocumentRow, "status" | "amount" | "due_date">;

/** Situação do parcelamento para o selo do card. */
export type PlanStatus = "em_dia" | "atencao" | "vencida" | "quitado";

export interface PlanSummary {
  total: number; // total de parcelas do plano
  pagas: number; // quantas já foram marcadas como pagas
  restantes: number; // parcelas que faltam (total - pagas)
  pct: number; // 0..100 (pagas / total)
  proxima: ParcelaLike | null; // próxima parcela em aberto (menor vencimento)
  ultima: ParcelaLike | null; // parcela de maior vencimento (exibida quando quitado)
  valorParcela: number | null; // valor representativo (a próxima, ou a última conhecida)
  diasParaVencer: number | null; // dias até a próxima parcela (negativo = vencida)
  quitado: boolean; // todas as parcelas pagas
  status: PlanStatus; // selo: em dia / atenção / vencida / quitado
  /** Cor do anel/barra: vermelho = vencida; amarelo = vence em breve; verde = em dia/quitado. */
  cor: BarColor;
}

const BAR_BG: Record<BarColor, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

/** Classe de fundo da barra de progresso para uma cor. */
export function barColorClass(cor: BarColor): string {
  return BAR_BG[cor];
}

/**
 * Resume um parcelamento a partir das suas parcelas (documentos).
 * Fonte única dos cards: progresso, próxima parcela, saldo e cor.
 */
export function summarizePlan(
  total: number,
  parcelas: ParcelaLike[],
): PlanSummary {
  const pagas = parcelas.filter((p) => p.status === "paid").length;
  const abertas = parcelas.filter((p) => p.status === "open");
  const comData = parcelas.filter((p) => p.due_date);

  // Próxima parcela em aberto = menor data de vencimento entre as abertas.
  const proxima =
    abertas
      .filter((p) => p.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0] ?? null;

  // Última parcela = maior vencimento (exibida quando o plano está quitado).
  const ultima =
    [...comData].sort((a, b) => (a.due_date! > b.due_date! ? -1 : 1))[0] ?? null;

  const quitado = total > 0 && pagas >= total;
  const restantes = Math.max(total - pagas, 0);
  const pct = total > 0 ? Math.round((pagas / total) * 1000) / 10 : 0;

  // Valor representativo: o da próxima parcela; senão, o da última conhecida.
  const valorParcela =
    proxima?.amount ??
    [...parcelas].reverse().find((p) => p.amount != null)?.amount ??
    null;

  let cor: BarColor = "green";
  let diasParaVencer: number | null = null;
  if (!quitado && proxima?.due_date) {
    const u = getUrgency(proxima.due_date, proxima.status);
    diasParaVencer = u.days;
    cor = u.tone === "danger" ? "red" : u.tone === "warning" ? "amber" : "green";
  }

  const status: PlanStatus = quitado
    ? "quitado"
    : cor === "red"
      ? "vencida"
      : cor === "amber"
        ? "atencao"
        : "em_dia";

  return {
    total,
    pagas,
    restantes,
    pct,
    proxima,
    ultima,
    valorParcela,
    diasParaVencer,
    quitado,
    status,
    cor,
  };
}

/** Rótulo da forma de pagamento do parcelamento (default: Boleto). */
export function formaPagamentoLabel(forma?: string | null): string {
  return forma === "debito_automatico" ? "Débito automático" : "Boleto";
}
