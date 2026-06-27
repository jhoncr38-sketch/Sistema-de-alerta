import { getUrgency } from "@/lib/dates";
import type { DocumentRow } from "@/lib/types";

export type BarColor = "green" | "amber" | "red";

/** Campos mínimos de uma parcela para o resumo (a lista não precisa do resto). */
export type ParcelaLike = Pick<DocumentRow, "status" | "amount" | "due_date">;

export interface PlanSummary {
  total: number; // total de parcelas do plano
  pagas: number; // quantas já foram marcadas como pagas
  pct: number; // 0..100 (pagas / total)
  saldoRestante: number; // soma do valor das parcelas em aberto
  proxima: ParcelaLike | null; // próxima parcela em aberto (menor vencimento)
  quitado: boolean; // todas as parcelas pagas
  /** Cor da barra: vermelho = parcela vencida; amarelo = vence em ≤7 dias; verde = em dia/quitado. */
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

  const saldoRestante = abertas.reduce((acc, p) => acc + (p.amount ?? 0), 0);

  // Próxima parcela em aberto = menor data de vencimento entre as abertas.
  const proxima =
    abertas
      .filter((p) => p.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0] ?? null;

  const quitado = total > 0 && pagas >= total;
  const pct = total > 0 ? Math.round((pagas / total) * 1000) / 10 : 0;

  let cor: BarColor = "green";
  if (!quitado && proxima?.due_date) {
    const { tone } = getUrgency(proxima.due_date, proxima.status);
    cor = tone === "danger" ? "red" : tone === "warning" ? "amber" : "green";
  }

  return { total, pagas, pct, saldoRestante, proxima, quitado, cor };
}
