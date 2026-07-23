import {
  MonthlyReport,
  type ReportRow,
  type ReportStat,
} from "@/components/monthly-report";
import { getBranding } from "@/lib/branding";
import { getClientCompanyContext } from "@/lib/companies";
import { docTypeLabel } from "@/lib/constants";
import { currentCompetenciaKey, getUrgency } from "@/lib/dates";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import {
  calcularNumeros,
  competenciaExtenso,
  type ResumoDoc,
} from "@/lib/ai/resumo";
import { createClient } from "@/lib/supabase/server";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CAP = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Guia com os campos que o relatório precisa (números + linhas de próximos). */
interface ReportDoc extends ResumoDoc {
  id: string;
  competencia: string | null;
  parcela_num: number | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** "YYYY-MM" -> mês anterior. */
function prevMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}
/** "YYYY-MM" -> mês seguinte. */
function nextMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}
/** Primeiro e último dia (YYYY-MM-DD) de um mês "YYYY-MM". */
function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-${pad2(last)}` };
}
function pct(v: number): string {
  return `${Math.abs(v).toFixed(1).replace(".", ",")}%`;
}
function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

/**
 * Relatório mensal do cliente ("prestação de contas"). É todo por COMPETÊNCIA
 * (o mês da guia), igual ao dashboard de faturamento — então "Impostos do mês"
 * são os tributos apurados na competência (mesma base da carga), e não a soma
 * por data de pagamento (que inflava por causa de parcelas de parcelamento
 * marcadas em lote no mesmo dia). Renderiza uma folha pronta para imprimir/
 * salvar como PDF. `?mes=YYYY-MM` escolhe o mês (padrão: o anterior).
 */
export default async function PortalRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const [{ active }, branding, sp] = await Promise.all([
    getClientCompanyContext(),
    getBranding(),
    searchParams,
  ]);
  const activeId = active?.id ?? "00000000-0000-0000-0000-000000000000";

  const currentKey = currentCompetenciaKey();
  const mesParam =
    typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  let competencia = mesParam ?? prevMonthKey(currentKey);
  if (competencia > currentKey) competencia = currentKey; // nunca no futuro
  const [cy, cm] = competencia.split("-").map(Number);

  const supabase = await createClient();
  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
      )
      .eq("company_id", activeId),
    supabase
      .from("revenues")
      .select("competencia, amount")
      .eq("company_id", activeId),
  ]);

  const docs = (docsRaw ?? []) as ReportDoc[];
  const companyName =
    active?.nome_fantasia || active?.razao_social || "Sua empresa";

  // Vencidas em aberto (hoje) e a vencer no próximo mês — para "Situação".
  const numeros = calcularNumeros(docs, competencia);

  // Faturamento/impostos por COMPETÊNCIA (mesma fonte do dashboard).
  const fat = buildFaturamento(
    docs as DocInput[],
    (revenuesRaw ?? []) as RevenueInput[],
    24,
  );
  const point = fat.data.find((p) => p.key === competencia) ?? null;
  const impostosMes = point?.tributos ?? 0; // isTributo apurado na competência
  const faturamentoMes = point?.faturamento ?? 0;
  const cargaMes = point?.carga ?? null;

  const upto = fat.data.filter((p) => p.key <= competencia && p.faturamento > 0);
  const sparkPts = upto.slice(-6).map((p) => p.faturamento);
  let crescimento: number | null = null;
  if (faturamentoMes > 0 && upto.length >= 2) {
    const prev = upto[upto.length - 2].faturamento;
    if (prev > 0) crescimento = ((faturamentoMes - prev) / prev) * 100;
  }

  // Cartões (todos por competência / status atual).
  const stats: ReportStat[] = [];
  if (faturamentoMes > 0) {
    stats.push({
      k: "Faturamento",
      v: formatCurrency(faturamentoMes),
      s:
        crescimento != null
          ? `${crescimento >= 0 ? "▲" : "▼"} ${pct(crescimento)}`
          : "no mês",
      tone: crescimento != null && crescimento < 0 ? "down" : "up",
    });
  }
  if (cargaMes != null) {
    stats.push({
      k: "Carga tributária",
      v: pct(cargaMes),
      s: "do faturamento",
      tone: "neutral",
    });
  }
  stats.push({
    k: "A vencer",
    v: formatCurrency(numeros.vencemProxMesValor),
    s: `${numeros.vencemProxMes} ${plural(numeros.vencemProxMes, "guia", "guias")} no próximo mês`,
    tone: "neutral",
  });
  stats.push({
    k: "Situação",
    v:
      numeros.emAtraso === 0
        ? "Em dia"
        : `${numeros.emAtraso} ${plural(numeros.emAtraso, "vencida", "vencidas")}`,
    s: numeros.emAtraso === 0 ? "sem pendências" : "a regularizar",
    tone: numeros.emAtraso === 0 ? "up" : "down",
  });

  // Faixa de destaque (situação real, sem alegar "quitado").
  const mesExtenso = competenciaExtenso(competencia);
  let heroTone: "emdia" | "atencao" = "emdia";
  let heroEyebrow = "Obrigações em dia";
  let heroTitle = `Suas obrigações de ${mesExtenso} estão em dia.`;
  if (numeros.emAtraso > 0) {
    heroTone = "atencao";
    heroEyebrow = "Requer atenção";
    heroTitle = `Você tem ${numeros.emAtraso} ${plural(
      numeros.emAtraso,
      "guia vencida",
      "guias vencidas",
    )} para regularizar.`;
  }

  // Próximos vencimentos (mês seguinte à competência).
  const nextYm = nextMonthKey(competencia);
  const nb = monthBounds(nextYm);
  const proximos: ReportRow[] = docs
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
    .slice(0, 8)
    .map((d) => {
      const urg = getUrgency(d.due_date as string, d.status).urgency;
      const tom =
        urg === "vencido" || urg === "vence_hoje"
          ? ("vencido" as const)
          : urg === "proximos_3" || urg === "proximos_7"
            ? ("avencer" as const)
            : ("emdia" as const);
      const tipo =
        d.categoria === "parcelamento" && d.parcela_num
          ? `Parcela ${d.parcela_num}`
          : docTypeLabel(d.type);
      return {
        id: d.id,
        tipo,
        subtitle: d.competencia ? `Competência ${d.competencia}` : "",
        whenLabel: `Vence ${formatDayMonth(d.due_date as string)}`,
        amountLabel: d.amount != null ? formatCurrency(d.amount) : null,
        tom,
      };
    });

  // Resumo em palavras simples, montado a partir dos números por competência
  // (correto e coerente com os cartões; não usa a soma por data de pagamento).
  const partes: string[] = [];
  partes.push(
    faturamentoMes > 0
      ? `Em ${mesExtenso}, ${companyName} apurou ${formatCurrency(
          impostosMes,
        )} em impostos sobre um faturamento de ${formatCurrency(faturamentoMes)}${
          cargaMes != null ? ` (carga de ${pct(cargaMes)})` : ""
        }.`
      : `Em ${mesExtenso}, ${companyName} apurou ${formatCurrency(
          impostosMes,
        )} em impostos.`,
  );
  if (numeros.emAtraso > 0) {
    partes.push(
      `Há ${numeros.emAtraso} ${plural(
        numeros.emAtraso,
        "guia vencida",
        "guias vencidas",
      )} (${formatCurrency(numeros.emAtrasoValor)}) que ${plural(
        numeros.emAtraso,
        "precisa",
        "precisam",
      )} de atenção.`,
    );
  } else {
    partes.push("Suas obrigações estão em dia.");
  }
  if (numeros.vencemProxMes > 0) {
    partes.push(
      `Para ${MESES[Number(nextYm.split("-")[1]) - 1]}, ${numeros.vencemProxMes} ${plural(
        numeros.vencemProxMes,
        "guia a vencer",
        "guias a vencer",
      )}, somando ${formatCurrency(numeros.vencemProxMesValor)}.`,
    );
  }
  const resumoTexto = partes.join(" ");

  const nextNavYm = nextMonthKey(competencia);

  return (
    <MonthlyReport
      brandName={branding.name}
      companyName={companyName}
      cnpj={active?.cnpj ?? null}
      competenciaBadge={`${MESES_CAP[cm - 1]} · ${cy}`}
      heroTone={heroTone}
      heroEyebrow={heroEyebrow}
      heroTitle={heroTitle}
      heroValueLabel="Impostos do mês"
      heroValue={formatCurrency(impostosMes)}
      stats={stats}
      faturamento={
        faturamentoMes > 0
          ? {
              valorLabel: formatCurrency(faturamentoMes),
              sub:
                crescimento != null
                  ? `${crescimento >= 0 ? "Subiu" : "Caiu"} ${pct(
                      crescimento,
                    )} em relação ao mês anterior.`
                  : "Faturamento registrado no mês.",
              spark: sparkPts,
            }
          : null
      }
      proximos={proximos}
      proximosMesLabel={MESES[Number(nextYm.split("-")[1]) - 1]}
      resumoTexto={resumoTexto}
      prevHref={`/portal/relatorio?mes=${prevMonthKey(competencia)}`}
      nextHref={
        nextNavYm <= currentKey ? `/portal/relatorio?mes=${nextNavYm}` : null
      }
      backHref="/portal"
    />
  );
}
