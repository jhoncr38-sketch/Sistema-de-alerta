import { calcularNumeros, competenciaExtenso, type ResumoDoc } from "@/lib/ai/resumo";
import { docTypeLabel } from "@/lib/constants";
import { getUrgency } from "@/lib/dates";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";

const MESES_CAP = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Guia com os campos que o relatório precisa. */
export interface RelatorioDoc extends ResumoDoc {
  id: string;
  competencia: string | null;
  parcela_num: number | null;
}

export type Tom = "vencido" | "avencer" | "emdia";

export interface ProximoItem {
  id: string;
  tipo: string;
  subtitle: string;
  dueDate: string; // YYYY-MM-DD
  amount: number | null;
  tom: Tom;
}

/** Tudo que o relatório mensal precisa, calculado num só lugar (página + envio). */
export interface RelatorioModel {
  competencia: string; // "YYYY-MM"
  mesLabel: string; // "Junho"
  ano: number;
  mesExtenso: string; // "junho de 2026"
  pagosValor: number;
  pagos: number;
  faturamentoMes: number;
  cargaMes: number | null;
  crescimento: number | null;
  mesAnteriorLabel: string | null; // "Maio"
  fatAnterior: number | null;
  emAtraso: number;
  emAtrasoValor: number;
  proximos: ProximoItem[];
  proximosTotal: number;
  proximosMesLabel: string; // "Julho"
  resumoTexto: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** "YYYY-MM" -> mês anterior. */
export function prevMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}
/** "YYYY-MM" -> mês seguinte. */
export function nextMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}
function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-${pad2(last)}` };
}
function monthName(ym: string): string {
  return MESES_CAP[Number(ym.split("-")[1]) - 1];
}
function pct(v: number): string {
  return `${Math.abs(v).toFixed(1).replace(".", ",")}%`;
}
function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

/**
 * Monta o modelo do relatório mensal de uma empresa, por COMPETÊNCIA para
 * faturamento/carga (igual ao dashboard) e por CAIXA (data de pagamento, já
 * corrigido para parcelamento) no "total pago". É puro: a página do painel e a
 * ação de envio por e-mail usam a MESMA função, então os números sempre batem.
 */
export function montarRelatorio(
  docs: RelatorioDoc[],
  revenues: RevenueInput[],
  competencia: string,
  companyName: string,
  today: Date = new Date(),
): RelatorioModel {
  const numeros = calcularNumeros(docs, competencia, today);

  const fat = buildFaturamento(docs as DocInput[], revenues, 24);
  const point = fat.data.find((p) => p.key === competencia) ?? null;
  const faturamentoMes = point?.faturamento ?? 0;
  const cargaMes = point?.carga ?? null;

  const upto = fat.data.filter((p) => p.key <= competencia && p.faturamento > 0);
  let crescimento: number | null = null;
  let mesAnteriorLabel: string | null = null;
  let fatAnterior: number | null = null;
  if (faturamentoMes > 0 && upto.length >= 2) {
    const prev = upto[upto.length - 2];
    fatAnterior = prev.faturamento;
    mesAnteriorLabel = monthName(prev.key);
    if (prev.faturamento > 0) {
      crescimento = ((faturamentoMes - prev.faturamento) / prev.faturamento) * 100;
    }
  }

  // Próximos vencimentos (mês seguinte à competência).
  const nextYm = nextMonthKey(competencia);
  const nb = monthBounds(nextYm);
  const proximos: ProximoItem[] = docs
    .filter(
      (d) =>
        (d.categoria === "boleto" || d.categoria === "parcelamento") &&
        d.status !== "paid" &&
        d.due_date != null,
    )
    .filter((d) => {
      const day = (d.due_date as string).split("T")[0];
      return day >= nb.start && day <= nb.end;
    })
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .map((d) => {
      const urg = getUrgency(d.due_date as string, d.status).urgency;
      const tom: Tom =
        urg === "vencido" || urg === "vence_hoje"
          ? "vencido"
          : urg === "proximos_3" || urg === "proximos_7"
            ? "avencer"
            : "emdia";
      const tipo =
        d.categoria === "parcelamento" && d.parcela_num
          ? `Parcela ${d.parcela_num}`
          : docTypeLabel(d.type);
      return {
        id: d.id,
        tipo,
        subtitle: d.competencia ? `Competência ${d.competencia}` : "",
        dueDate: (d.due_date as string).split("T")[0],
        amount: d.amount,
        tom,
      };
    });
  const proximosTotal = proximos.reduce((s, p) => s + (p.amount ?? 0), 0);

  // Resumo em palavras simples (mesma ordem do layout).
  const mesExtenso = competenciaExtenso(competencia);
  const partes: string[] = [];
  if (numeros.pagos > 0) {
    partes.push(
      `Em ${mesExtenso}, a ${companyName} pagou ${formatCurrency(numeros.pagosValor)} em ${numeros.pagos} ${plural(numeros.pagos, "guia", "guias")}.`,
    );
  } else {
    partes.push(`Em ${mesExtenso}, a ${companyName} não teve guias quitadas.`);
  }
  if (faturamentoMes > 0) {
    const varTxt =
      crescimento != null && mesAnteriorLabel
        ? `, ${crescimento >= 0 ? "um aumento" : "uma queda"} de ${pct(crescimento)} sobre ${mesAnteriorLabel.toLowerCase()}`
        : "";
    const cargaTxt = cargaMes != null ? `, com carga tributária de ${pct(cargaMes)}` : "";
    partes.push(
      `O faturamento foi de ${formatCurrency(faturamentoMes)}${varTxt}${cargaTxt}.`,
    );
  }
  const trechos: string[] = [];
  if (numeros.emAtraso > 0) {
    trechos.push(
      `${numeros.emAtraso} ${plural(numeros.emAtraso, "guia vencida", "guias vencidas")} a regularizar`,
    );
  }
  if (numeros.vencemProxMes > 0) {
    trechos.push(
      `${numeros.vencemProxMes} ${plural(numeros.vencemProxMes, "prevista", "previstas")} para ${monthName(nextYm).toLowerCase()}, somando ${formatCurrency(numeros.vencemProxMesValor)}`,
    );
  }
  if (trechos.length > 0) {
    partes.push(`Há ${trechos.join(" e ")}.`);
  } else {
    partes.push("Suas obrigações estão em dia.");
  }

  const [cy, cm] = competencia.split("-").map(Number);
  return {
    competencia,
    mesLabel: MESES_CAP[cm - 1],
    ano: cy,
    mesExtenso,
    pagosValor: numeros.pagosValor,
    pagos: numeros.pagos,
    faturamentoMes,
    cargaMes,
    crescimento,
    mesAnteriorLabel,
    fatAnterior,
    emAtraso: numeros.emAtraso,
    emAtrasoValor: numeros.emAtrasoValor,
    proximos,
    proximosTotal,
    proximosMesLabel: monthName(nextYm),
    resumoTexto: partes.join(" "),
  };
}
