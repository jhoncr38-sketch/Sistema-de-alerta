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
  resumoFallback,
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

/**
 * Relatório mensal do cliente ("prestação de contas"). Reaproveita os mesmos
 * cálculos do resumo por IA (`calcularNumeros`) e do dashboard de faturamento
 * (`buildFaturamento`); o texto em linguagem simples vem de `monthly_summaries`
 * (gerado pelo cron) ou, na falta, do fallback local. Renderiza uma folha pronta
 * para imprimir/salvar como PDF. `?mes=YYYY-MM` escolhe o mês (padrão: o anterior).
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
  const [{ data: docsRaw }, { data: revenuesRaw }, { data: summaryRaw }] =
    await Promise.all([
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
      supabase
        .from("monthly_summaries")
        .select("texto")
        .eq("company_id", activeId)
        .eq("competencia", competencia)
        .maybeSingle(),
    ]);

  const docs = (docsRaw ?? []) as ReportDoc[];
  const companyName =
    active?.nome_fantasia || active?.razao_social || "Sua empresa";

  // Números do mês (mesma fonte do resumo por IA).
  const numeros = calcularNumeros(docs, competencia);

  // Faturamento por competência (mesma fonte do dashboard).
  const fat = buildFaturamento(
    docs as DocInput[],
    (revenuesRaw ?? []) as RevenueInput[],
    24,
  );
  const point = fat.data.find((p) => p.key === competencia) ?? null;
  const upto = fat.data.filter((p) => p.key <= competencia && p.faturamento > 0);
  const sparkPts = upto.slice(-6).map((p) => p.faturamento);
  let crescimento: number | null = null;
  if (point && point.faturamento > 0 && upto.length >= 2) {
    const prev = upto[upto.length - 2].faturamento;
    if (prev > 0) crescimento = ((point.faturamento - prev) / prev) * 100;
  }

  // Cartões de números.
  const stats: ReportStat[] = [
    {
      k: "Total pago",
      v: formatCurrency(numeros.pagosValor),
      s:
        numeros.pagos === 1
          ? "1 guia quitada"
          : `${numeros.pagos} guias quitadas`,
      tone: "up",
    },
  ];
  if (point && point.faturamento > 0) {
    stats.push({
      k: "Faturamento",
      v: formatCurrency(point.faturamento),
      s:
        crescimento != null
          ? `${crescimento >= 0 ? "▲" : "▼"} ${pct(crescimento)}`
          : "no mês",
      tone: crescimento != null && crescimento < 0 ? "down" : "up",
    });
  }
  if (point && point.carga != null) {
    stats.push({
      k: "Carga tributária",
      v: pct(point.carga),
      s: "do faturamento",
      tone: "neutral",
    });
  }
  stats.push({
    k: "Situação",
    v:
      numeros.emAtraso === 0
        ? "Em dia"
        : `${numeros.emAtraso} vencida${numeros.emAtraso === 1 ? "" : "s"}`,
    s: numeros.emAtraso === 0 ? "sem pendências" : "a regularizar",
    tone: numeros.emAtraso === 0 ? "up" : "down",
  });

  // Faixa de destaque, coerente com os dados.
  const mesExtenso = competenciaExtenso(competencia);
  let heroTone: "emdia" | "atencao" = "emdia";
  let heroEyebrow = "Mês fechado em dia";
  let heroTitle = `Todas as guias de ${mesExtenso} foram quitadas.`;
  if (numeros.emAtraso > 0) {
    heroTone = "atencao";
    heroEyebrow = "Requer atenção";
    heroTitle = `Você tem ${numeros.emAtraso} guia${
      numeros.emAtraso === 1 ? "" : "s"
    } vencida${numeros.emAtraso === 1 ? "" : "s"} para regularizar.`;
  } else if (numeros.pagos === 0) {
    heroEyebrow = "Tudo tranquilo";
    heroTitle = `Nenhuma guia venceu em ${mesExtenso}. Nada a pagar.`;
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

  const resumoTexto =
    (summaryRaw as { texto: string } | null)?.texto ??
    resumoFallback(numeros, companyName);

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
      totalPagoLabel={formatCurrency(numeros.pagosValor)}
      stats={stats}
      faturamento={
        point && point.faturamento > 0
          ? {
              valorLabel: formatCurrency(point.faturamento),
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
