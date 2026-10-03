import { docTypeLabel } from "@/lib/constants";
import { getUrgency } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";

/**
 * Regras do portal do cliente (redesenho): em que "situação" cada guia está e
 * os textos curtos que aparecem nas telas. Fonte de verdade: status da guia +
 * getUrgency (lib/dates) + pedido de 2ª via pendente.
 *
 *   precisa  → em aberto e VENCIDA, sem 2ª via pedida (ação: pedir 2ª via)
 *   a_pagar  → em aberto e dentro do prazo (ação: baixar)
 *   contador → aguardando confirmação OU 2ª via pedida (nada a fazer)
 *   pago     → pago
 */
export type Situacao = "precisa" | "a_pagar" | "contador" | "pago";

/** Campos mínimos de uma guia para calcular a situação e os textos. */
export type GuiaLike = Pick<
  DocumentRow,
  | "id"
  | "status"
  | "due_date"
  | "categoria"
  | "type"
  | "descricao"
  | "parcela_num"
  | "paid_at"
  | "marcado_pago_at"
  | "comprovante_at"
>;

export function situacaoGuia(
  d: Pick<DocumentRow, "id" | "status" | "due_date">,
  reissuePendente: ReadonlySet<string>,
  today: Date = new Date(),
): Situacao {
  if (d.status === "paid") return "pago";
  if (d.status === "aguardando") return "contador";
  if (reissuePendente.has(d.id)) return "contador";
  if (d.due_date && getUrgency(d.due_date, d.status, today).urgency === "vencido") {
    return "precisa";
  }
  return "a_pagar";
}

/** Nome curto da guia: parcela mostra "Parcela N"; "Outro" usa a descrição. */
export function guiaNome(
  d: Pick<DocumentRow, "categoria" | "type" | "descricao" | "parcela_num">,
): string {
  if (d.categoria === "parcelamento" && d.parcela_num) {
    return `Parcela ${d.parcela_num}`;
  }
  if (d.type === "outro" && d.descricao) return d.descricao;
  return docTypeLabel(d.type);
}

/** "em 17 dias" / "amanhã" / "hoje" — distância até o vencimento. */
export function emDias(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

/** "há 44 dias" / "ontem" — atraso de uma guia vencida. */
export function haDias(days: number): string {
  const n = Math.abs(days);
  if (n === 1) return "ontem";
  return `há ${n} dias`;
}

/** Converte timestamp ISO em "dd/mm" no fuso do Brasil. */
export function diaMesTs(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Detalhe curto da guia, conforme a situação. Ex.:
 *   precisa  → "Venceu 20/08 · há 44 dias"
 *   a_pagar  → "Vence 20/10 · em 17 dias"
 *   contador → "2ª via pedida 03/10" / "Comprovante enviado 01/10"
 *   pago     → "Pago 18/09"
 */
export function guiaMeta(
  d: GuiaLike,
  situacao: Situacao,
  reissuePedidaEm?: string | null,
  today: Date = new Date(),
): string {
  const venc = d.due_date ? formatDayMonth(d.due_date) : null;
  if (situacao === "pago") {
    const quando = d.paid_at ?? d.marcado_pago_at;
    return quando ? `Pago ${diaMesTs(quando)}` : "Pago";
  }
  if (situacao === "contador") {
    if (d.status === "aguardando") {
      if (d.comprovante_at) return `Comprovante enviado ${diaMesTs(d.comprovante_at)}`;
      if (d.marcado_pago_at) return `Pagamento informado ${diaMesTs(d.marcado_pago_at)}`;
      return "Pagamento informado";
    }
    return reissuePedidaEm ? `2ª via pedida ${diaMesTs(reissuePedidaEm)}` : "2ª via pedida";
  }
  if (!d.due_date || !venc) return "Sem vencimento";
  const { days } = getUrgency(d.due_date, d.status, today);
  if (situacao === "precisa") return `Venceu ${venc} · ${haDias(days)}`;
  return days === 0 ? "Vence hoje" : `Vence ${venc} · ${emDias(days)}`;
}

/**
 * Parcela de débito automático que vence a mais de 7 dias. Como o débito gera
 * todas as parcelas de uma vez, as futuras ficam fora das listas "em aberto" —
 * continuam no detalhe do parcelamento. Só aparecem as vencidas ou a vencer em
 * ≤7 dias (as acionáveis).
 */
export function ehDebitoAutomaticoFuturo(
  d: Pick<DocumentRow, "categoria" | "due_date" | "status">,
  formaPagamento: string | null | undefined,
): boolean {
  if (d.categoria !== "parcelamento") return false;
  if (formaPagamento !== "debito_automatico") return false;
  if (!d.due_date) return false;
  return getUrgency(d.due_date, d.status).urgency === "em_dia";
}

/** Cores de cada situação (ponto, texto, borda da coluna). */
export const SITUACAO_COR: Record<
  Situacao,
  { dot: string; text: string; border: string; label: string }
> = {
  precisa: {
    dot: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-600",
    label: "Atrasado",
  },
  a_pagar: {
    dot: "bg-primary",
    text: "text-primary",
    border: "border-primary",
    label: "A pagar",
  },
  contador: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-500",
    label: "Com o contador",
  },
  pago: {
    dot: "bg-emerald-600",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-600",
    label: "Pago",
  },
};

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "outubro" (mês 1..12). */
export function mesNome(mes: number): string {
  return MESES_LONGOS[mes - 1] ?? String(mes);
}

/** "Setembro 2026" a partir de uma chave "2026-09". */
export function mesAnoLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const nome = mesNome(m);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${y}`;
}

/** Chave "YYYY-MM" de uma data ISO (YYYY-MM-DD ou timestamp). */
export function mesKey(iso: string): string {
  return iso.slice(0, 7);
}
