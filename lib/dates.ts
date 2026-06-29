import type { DocStatus } from "@/lib/types";

export type Tone = "danger" | "warning" | "info" | "success" | "muted";

export type Urgency =
  | "pago"
  | "vencido"
  | "vence_hoje"
  | "proximos_3"
  | "proximos_7"
  | "em_dia";

export interface UrgencyInfo {
  urgency: Urgency;
  label: string;
  days: number; // dias até o vencimento (negativo = atrasado)
  tone: Tone;
}

/** Parseia "YYYY-MM-DD" como data local (evita deslocamento de fuso). */
function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return startOfDay(value);
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MS_PER_DAY = 86_400_000;

/**
 * Calcula a urgência de um boleto a partir do vencimento e do status.
 * É a fonte única de verdade dos selos coloridos, banners e métricas.
 */
export function getUrgency(
  dueDate: string | Date,
  status: DocStatus = "open",
  today: Date = new Date(),
): UrgencyInfo {
  const due = parseLocalDate(dueDate);
  const ref = startOfDay(today);
  const days = Math.round((due.getTime() - ref.getTime()) / MS_PER_DAY);

  if (status === "paid") {
    return { urgency: "pago", label: "Pago", days, tone: "success" };
  }
  if (days < 0) {
    return { urgency: "vencido", label: "Vencido", days, tone: "danger" };
  }
  if (days === 0) {
    return { urgency: "vence_hoje", label: "Vence hoje", days, tone: "warning" };
  }
  if (days <= 3) {
    return {
      urgency: "proximos_3",
      label: `${days} ${days === 1 ? "dia" : "dias"}`,
      days,
      tone: "warning",
    };
  }
  if (days <= 7) {
    return { urgency: "proximos_7", label: `${days} dias`, days, tone: "info" };
  }
  return { urgency: "em_dia", label: `${days} dias`, days, tone: "success" };
}

const COMPETENCIA_RE = /^(\d{1,2})\/(\d{4})$/;
const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Converte "06/2026" (ou "6/2026") no 1º dia do mês como data local.
 * Retorna null se o formato não bater — usado para ordenar/agrupar por mês.
 */
export function parseCompetencia(
  competencia: string | null | undefined,
): Date | null {
  if (!competencia) return null;
  const m = competencia.trim().match(COMPETENCIA_RE);
  if (!m) return null;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

/** Normaliza "6/2026" -> "06/2026". Mantém a entrada se não for competência. */
export function normalizeCompetencia(competencia: string): string {
  const m = competencia.trim().match(COMPETENCIA_RE);
  if (!m) return competencia.trim();
  return `${m[1].padStart(2, "0")}/${m[2]}`;
}

/** Chave ordenável "YYYY-MM" a partir de uma competência. */
export function competenciaKey(competencia: string): string | null {
  const d = parseCompetencia(competencia);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Rótulo curto para eixos de gráfico: "jun/26". */
export function competenciaShortLabel(competencia: string): string {
  const d = parseCompetencia(competencia);
  if (!d) return competencia;
  return `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Mês de referência atual como chave "YYYY-MM", no fuso do Brasil
 * (America/Sao_Paulo) para não virar o mês indevidamente em servidores UTC.
 * Usado para ignorar competências futuras nos relatórios.
 */
export function currentCompetenciaKey(today: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(today);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** Categoria usada pelo cron de e-mails (null = não dispara alerta). */
export function alertKind(
  dueDate: string | Date,
  status: DocStatus = "open",
  today: Date = new Date(),
): "vencido" | "vence_hoje" | "dias_1" | "dias_3" | "dias_7" | null {
  if (status === "paid") return null;
  const { urgency, days } = getUrgency(dueDate, status, today);
  if (urgency === "vencido") return "vencido";
  if (urgency === "vence_hoje") return "vence_hoje";
  if (days === 1) return "dias_1"; // véspera (D-1): lembrete reforçado
  if (urgency === "proximos_3") return "dias_3";
  if (urgency === "proximos_7") return "dias_7";
  return null;
}
