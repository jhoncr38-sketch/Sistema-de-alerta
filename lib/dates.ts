import type { DocStatus } from "@/lib/types";

export type Tone = "danger" | "warning" | "info" | "success" | "muted";

export type Urgency =
  | "pago"
  | "aguardando"
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
  if (status === "aguardando") {
    return {
      urgency: "aguardando",
      label: "Aguardando confirmação",
      days,
      tone: "warning",
    };
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

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const feriadosCache = new Map<number, Map<string, string>>();

/**
 * Feriados nacionais em que os bancos não abrem (fixos + Carnaval, Sexta-feira
 * Santa e Corpus Christi). Feriados estaduais/municipais não entram.
 */
function feriadosDoAno(ano: number): Map<string, string> {
  const pronto = feriadosCache.get(ano);
  if (pronto) return pronto;
  const p = pascoa(ano);
  const rel = (dias: number) => isoLocal(new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias));
  const mapa = new Map<string, string>([
    [`${ano}-01-01`, "Confraternização"],
    [rel(-48), "Carnaval"],
    [rel(-47), "Carnaval"],
    [rel(-2), "Sexta-feira Santa"],
    [`${ano}-04-21`, "Tiradentes"],
    [`${ano}-05-01`, "Dia do Trabalho"],
    [rel(60), "Corpus Christi"],
    [`${ano}-09-07`, "Independência"],
    [`${ano}-10-12`, "N. Sra. Aparecida"],
    [`${ano}-11-02`, "Finados"],
    [`${ano}-11-15`, "Proclamação da República"],
    [`${ano}-11-20`, "Consciência Negra"],
    [`${ano}-12-25`, "Natal"],
  ]);
  feriadosCache.set(ano, mapa);
  return mapa;
}

/** Nome do feriado nacional em "YYYY-MM-DD", ou null. */
export function feriadoNacional(iso: string): string | null {
  return feriadosDoAno(Number(iso.slice(0, 4))).get(iso) ?? null;
}

/** Dia útil = seg–sex e não é feriado nacional. */
export function ehDiaUtil(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow !== 0 && dow !== 6 && !feriadoNacional(iso);
}

/**
 * Soma `n` dias úteis (seg–sex, pulando feriados nacionais) a um momento e
 * devolve a data "YYYY-MM-DD" no fuso do Brasil. Ex.: pedido na sexta + 1 dia
 * útil = segunda. Base dos prazos das tarefas do contador (2ª via, confirmação).
 */
export function somarDiasUteis(momento: string | Date, n: number): string {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    typeof momento === "string" ? new Date(momento) : momento,
  );
  const [y, m, d] = iso.split("-").map(Number);
  const data = new Date(y, m - 1, d);
  let faltam = n;
  while (faltam > 0) {
    data.setDate(data.getDate() + 1);
    if (ehDiaUtil(isoLocal(data))) faltam--;
  }
  return isoLocal(data);
}

/** Categoria usada pelo cron de e-mails (null = não dispara alerta). */
export function alertKind(
  dueDate: string | Date,
  status: DocStatus = "open",
  today: Date = new Date(),
): "vencido" | "vence_hoje" | "dias_1" | "dias_3" | "dias_7" | null {
  // 'aguardando' = cliente já declarou pagamento; não cobra vencimento.
  if (status === "paid" || status === "aguardando") return null;
  const { urgency, days } = getUrgency(dueDate, status, today);
  if (urgency === "vencido") return "vencido";
  if (urgency === "vence_hoje") return "vence_hoje";
  if (days === 1) return "dias_1"; // véspera (D-1): lembrete reforçado
  if (urgency === "proximos_3") return "dias_3";
  if (urgency === "proximos_7") return "dias_7";
  return null;
}
