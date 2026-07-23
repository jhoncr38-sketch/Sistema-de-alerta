import { calcularNumeros, competenciaExtenso, type ResumoDoc } from "@/lib/ai/resumo";
import { docTypeLabel } from "@/lib/constants";
import { getUrgency } from "@/lib/dates";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency, formatDayMonth } from "@/lib/format";

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
  companyName: string;
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
    companyName,
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

/** Linha da tabela "Ação necessária" já formatada. */
export interface ProximoLinha {
  id: string;
  tipo: string;
  whenLabel: string; // "24/07"
  amountLabel: string;
}

/**
 * "View model" do relatório: tudo já formatado em strings, pronto para renderizar.
 * A folha na tela (`RelatorioSheet`, HTML) e o arquivo (`RelatorioPdf`, PDF) usam
 * o MESMO objeto — então a tela e o PDF enviado ficam idênticos.
 */
export interface RelatorioView {
  brandName: string;
  logoUrl: string | null;
  periodo: string; // "Junho · 2026"
  competenciaCurto: string; // "Competência 06/2026"
  cliente: string;
  cnpj: string | null;
  alerta: { tone: "atencao" | "ok"; texto: string };
  totalPagoLabel: string;
  guiasPagasLabel: string;
  proximos: ProximoLinha[];
  proximosMesLabel: string;
  totalAVencerLabel: string | null;
  faturamentoLabel: string | null;
  faturamentoVar: { pctLabel: string; tone: "up" | "down" } | null;
  cargaLabel: string | null;
  situacao: { valor: string; tone: "ok" | "alerta" };
  evolucao: {
    mesAnteriorLabel: string;
    fatAnteriorLabel: string;
    anteriorH: number;
    mesAtualLabel: string;
    fatAtualLabel: string;
    atualH: number;
    crescimentoLabel: string;
    crescimentoTone: "up" | "down";
  } | null;
  resumoTexto: string;
}

/** Formata o modelo em strings prontas para a folha (tela) e o PDF. */
export function montarView(
  model: RelatorioModel,
  meta: { brandName: string; logoUrl: string | null; cnpj: string | null },
): RelatorioView {
  const [cy, cm] = model.competencia.split("-").map(Number);
  const mesLower = model.mesLabel.toLowerCase();
  const emAtraso = model.emAtraso;

  const evolucao =
    model.faturamentoMes > 0 &&
    model.fatAnterior != null &&
    model.mesAnteriorLabel &&
    model.crescimento != null
      ? (() => {
          const maxFat = Math.max(model.faturamentoMes, model.fatAnterior ?? 0) || 1;
          return {
            mesAnteriorLabel: model.mesAnteriorLabel as string,
            fatAnteriorLabel: formatCurrency(model.fatAnterior ?? 0),
            anteriorH: Math.max(12, Math.round((120 * (model.fatAnterior ?? 0)) / maxFat)),
            mesAtualLabel: model.mesLabel,
            fatAtualLabel: formatCurrency(model.faturamentoMes),
            atualH: Math.max(12, Math.round((120 * model.faturamentoMes) / maxFat)),
            crescimentoLabel: `${(model.crescimento as number) >= 0 ? "+" : "−"}${pct(model.crescimento as number)}`,
            crescimentoTone: ((model.crescimento as number) >= 0 ? "up" : "down") as "up" | "down",
          };
        })()
      : null;

  return {
    brandName: meta.brandName,
    logoUrl: meta.logoUrl,
    periodo: `${model.mesLabel} · ${model.ano}`,
    competenciaCurto: `Competência ${String(cm).padStart(2, "0")}/${cy}`,
    cliente: model.companyName,
    cnpj: meta.cnpj,
    alerta:
      emAtraso > 0
        ? {
            tone: "atencao",
            texto: `${emAtraso} ${plural(emAtraso, "guia vencida", "guias vencidas")} a regularizar`,
          }
        : { tone: "ok", texto: "Tudo em dia" },
    totalPagoLabel: formatCurrency(model.pagosValor),
    guiasPagasLabel:
      model.pagos > 0
        ? `${model.pagos} ${plural(model.pagos, "guia quitada", "guias quitadas")} em ${mesLower}`
        : `Nenhuma guia quitada em ${mesLower}`,
    proximos: model.proximos.slice(0, 6).map((p) => ({
      id: p.id,
      tipo: p.tipo,
      whenLabel: formatDayMonth(p.dueDate),
      amountLabel: formatCurrency(p.amount ?? 0),
    })),
    proximosMesLabel: model.proximosMesLabel,
    totalAVencerLabel:
      model.proximos.length > 0 ? formatCurrency(model.proximosTotal) : null,
    faturamentoLabel:
      model.faturamentoMes > 0 ? formatCurrency(model.faturamentoMes) : null,
    faturamentoVar:
      model.crescimento != null
        ? {
            pctLabel: pct(model.crescimento),
            tone: model.crescimento >= 0 ? "up" : "down",
          }
        : null,
    cargaLabel: model.cargaMes != null ? pct(model.cargaMes) : null,
    situacao:
      emAtraso > 0
        ? { valor: `${emAtraso} ${plural(emAtraso, "vencida", "vencidas")}`, tone: "alerta" }
        : { valor: "Em dia", tone: "ok" },
    evolucao,
    resumoTexto: model.resumoTexto,
  };
}
