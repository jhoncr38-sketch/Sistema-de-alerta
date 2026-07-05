import { chatComplete } from "@/lib/ai/openai";
import { isTributo } from "@/lib/constants";
import { getUrgency } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocType } from "@/lib/types";

/**
 * Gera o RESUMO MENSAL de uma empresa em português.
 *
 * Princípio de segurança: os NÚMEROS são calculados aqui, no código, a partir
 * dos dados do banco. A IA recebe só esses números prontos e apenas os redige
 * em linguagem natural — nunca soma nem inventa valor. Se a IA estiver
 * indisponível, um texto simples (montado localmente) é usado no lugar, então
 * o resumo nunca depende da IA para existir.
 */

/** Guia (boleto/parcela) mínima necessária para o resumo. */
export interface ResumoDoc {
  type: DocType;
  amount: number | null;
  due_date: string | null;
  status: "open" | "aguardando" | "paid";
  marcado_pago_at: string | null;
  paid_at: string | null;
  categoria: "boleto" | "documento" | "folha" | "parcelamento";
}

export interface ResumoNumeros {
  competenciaLabel: string; // "junho de 2026"
  pagos: number;
  pagosValor: number;
  tributosValor: number; // parcela de "pagosValor" que é carga tributária
  vencemProxMes: number;
  vencemProxMesValor: number;
  maiorProxVencData: string | null; // vencimento do maior boleto do próximo mês
  maiorProxVencValor: number | null;
  emAtraso: number;
  emAtrasoValor: number;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-06" -> "junho de 2026". */
export function competenciaExtenso(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const mes = MESES[(m ?? 1) - 1] ?? "";
  return `${mes} de ${y}`;
}

/** Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM". */
function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // dia 0 do mês seguinte = último dia
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function isoDay(value: string): string {
  return value.split("T")[0];
}

/**
 * Calcula os números do mês de referência (competencia "YYYY-MM"):
 *  - pagos: guias quitadas cujo pagamento (marcado_pago_at/paid_at) caiu no mês;
 *  - vencem no mês seguinte: guias em aberto com vencimento no próximo mês;
 *  - em atraso: guias em aberto já vencidas (na data de hoje).
 */
export function calcularNumeros(
  docs: ResumoDoc[],
  competencia: string,
  today: Date = new Date(),
): ResumoNumeros {
  const cur = monthBounds(competencia);
  const [y, m] = competencia.split("-").map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const next = monthBounds(nextYm);

  let pagos = 0;
  let pagosValor = 0;
  let tributosValor = 0;
  let vencemProxMes = 0;
  let vencemProxMesValor = 0;
  let maiorProxVencData: string | null = null;
  let maiorProxVencValor: number | null = null;
  let emAtraso = 0;
  let emAtrasoValor = 0;

  for (const d of docs) {
    // Só guias a pagar entram no resumo financeiro (documentos/folha ficam de fora).
    const pagavel = d.categoria === "boleto" || d.categoria === "parcelamento";
    if (!pagavel) continue;
    const valor = d.amount ?? 0;

    // Pagos no mês de referência.
    if (d.status === "paid") {
      const ref = d.marcado_pago_at ?? d.paid_at;
      if (ref) {
        const day = isoDay(ref);
        if (day >= cur.start && day <= cur.end) {
          pagos++;
          pagosValor += valor;
          if (isTributo(d.type)) tributosValor += valor;
        }
      }
      continue;
    }

    // Em aberto (open/aguardando): olha o vencimento.
    if (!d.due_date) continue;
    const venc = isoDay(d.due_date);

    // Vencendo no próximo mês.
    if (venc >= next.start && venc <= next.end) {
      vencemProxMes++;
      vencemProxMesValor += valor;
      if (maiorProxVencValor == null || valor > maiorProxVencValor) {
        maiorProxVencValor = valor;
        maiorProxVencData = d.due_date;
      }
    }

    // Em atraso hoje (apenas 'open'; 'aguardando' já foi declarado pago).
    if (d.status === "open" && getUrgency(d.due_date, "open", today).urgency === "vencido") {
      emAtraso++;
      emAtrasoValor += valor;
    }
  }

  return {
    competenciaLabel: competenciaExtenso(competencia),
    pagos,
    pagosValor,
    tributosValor,
    vencemProxMes,
    vencemProxMesValor,
    maiorProxVencData,
    maiorProxVencValor,
    emAtraso,
    emAtrasoValor,
  };
}

/** Texto de reserva (sem IA): objetivo, montado a partir dos números. */
export function resumoFallback(n: ResumoNumeros, companyName: string): string {
  const partes: string[] = [];
  const nome = companyName ? companyName : "sua empresa";

  if (n.pagos > 0) {
    const trib =
      n.tributosValor > 0
        ? ` (${formatCurrency(n.tributosValor)} em impostos)`
        : "";
    partes.push(
      `Em ${n.competenciaLabel}, ${nome} quitou ${n.pagos} ${n.pagos === 1 ? "guia" : "guias"}, somando ${formatCurrency(n.pagosValor)}${trib}.`,
    );
  } else {
    partes.push(`Em ${n.competenciaLabel}, não houve guias quitadas.`);
  }

  if (n.emAtraso > 0) {
    partes.push(
      `Há ${n.emAtraso} ${n.emAtraso === 1 ? "guia vencida" : "guias vencidas"} em aberto (${formatCurrency(n.emAtrasoValor)}) que precisam de atenção.`,
    );
  }

  if (n.vencemProxMes > 0) {
    const maior =
      n.maiorProxVencData && n.maiorProxVencValor != null
        ? ` O maior vence em ${formatDate(n.maiorProxVencData)} (${formatCurrency(n.maiorProxVencValor)}).`
        : "";
    partes.push(
      `Para o próximo mês, ${n.vencemProxMes} ${n.vencemProxMes === 1 ? "guia" : "guias"} a vencer, totalizando ${formatCurrency(n.vencemProxMesValor)}.${maior}`,
    );
  } else if (n.emAtraso === 0) {
    partes.push("Nenhuma guia a vencer no próximo mês. Tudo em dia!");
  }

  return partes.join(" ");
}

/** Bloco de fatos (números já formatados) que a IA vai apenas redigir. */
function fatosParaIA(n: ResumoNumeros, companyName: string): string {
  const linhas = [
    `Empresa: ${companyName || "cliente"}`,
    `Mês de referência: ${n.competenciaLabel}`,
    `Guias pagas no mês: ${n.pagos}`,
    `Total pago no mês: ${formatCurrency(n.pagosValor)}`,
    `Impostos pagos no mês: ${formatCurrency(n.tributosValor)}`,
    `Guias vencidas em aberto (hoje): ${n.emAtraso} (${formatCurrency(n.emAtrasoValor)})`,
    `Guias a vencer no próximo mês: ${n.vencemProxMes} (${formatCurrency(n.vencemProxMesValor)})`,
  ];
  if (n.maiorProxVencData && n.maiorProxVencValor != null) {
    linhas.push(
      `Maior guia do próximo mês: ${formatCurrency(n.maiorProxVencValor)}, vence em ${formatDate(n.maiorProxVencData)}`,
    );
  }
  return linhas.join("\n");
}

/**
 * Redige o resumo com a IA a partir dos números. Se a IA não responder,
 * cai no texto de reserva. NUNCA lança.
 */
export async function gerarResumoMensal(
  docs: ResumoDoc[],
  competencia: string,
  companyName: string,
  today: Date = new Date(),
): Promise<{ texto: string; numeros: ResumoNumeros; fonte: "ia" | "fallback" }> {
  const numeros = calcularNumeros(docs, competencia, today);

  const system =
    "Você é o assistente da ContAlert, um portal de obrigações contábeis. " +
    "Escreva um resumo mensal curto (2 a 4 frases), em português do Brasil, tom " +
    "cordial e claro, para um cliente leigo em contabilidade. Use SOMENTE os " +
    "números fornecidos — nunca invente, calcule ou altere valores. Não use " +
    "listas nem markdown; escreva em texto corrido. Não repita o CNPJ.";

  const user =
    "Redija o resumo com base nestes dados (valores já calculados):\n\n" +
    fatosParaIA(numeros, companyName);

  const texto = await chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, maxTokens: 300 },
  );

  if (texto) return { texto, numeros, fonte: "ia" };
  return { texto: resumoFallback(numeros, companyName), numeros, fonte: "fallback" };
}
