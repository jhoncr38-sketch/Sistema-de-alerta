import { isTributo } from "@/lib/constants";
import {
  competenciaKey,
  competenciaShortLabel,
  currentCompetenciaKey,
  normalizeCompetencia,
} from "@/lib/dates";
import type { DocType } from "@/lib/types";

/**
 * Agrupamento das guias para o gráfico "Tributos por tipo".
 * Inclui TODAS as guias com valor (boletos a pagar): os tributos da carga
 * (DAS, DARFs, ISS, ICMS) e também os encargos/retenções lançados — GPS-INSS,
 * FGTS, ISS-RPA e Outro. Os 3 DARFs entram juntos em "DARF". Tipos sem valor
 * de guia (documentos institucionais, folha) ficam de fora.
 * (A carga tributária dos cards continua usando só isTributo/TRIBUTO_TYPES.)
 */
export interface TributoGroup {
  key: string;
  label: string;
  types: DocType[];
}

/** Grupo de uma guia sem mapeamento explícito (raro; cai em "Outro"). */
export const OUTROS_GROUP_KEY = "outro";

export const TRIBUTO_GROUPS: readonly TributoGroup[] = [
  { key: "das", label: "DAS", types: ["das"] },
  {
    key: "darf",
    label: "DARF",
    types: ["darf_irpj", "darf_piscofins", "darf_csll"],
  },
  { key: "iss", label: "ISS", types: ["iss"] },
  { key: "iss_rpa", label: "ISS - RPA", types: ["iss_rpa"] },
  { key: "icms", label: "ICMS", types: ["icms"] },
  { key: "inss", label: "INSS", types: ["gps_inss"] },
  { key: "fgts", label: "FGTS", types: ["fgts"] },
  { key: "outro", label: "Outro", types: ["outro"] },
];

const TYPE_TO_GROUP = new Map<DocType, string>(
  TRIBUTO_GROUPS.flatMap((g) => g.types.map((t) => [t, g.key] as const)),
);

/** Um ponto mensal do dashboard de faturamento. */
export interface MonthlyPoint {
  key: string; // "2026-06" (ordenável cronologicamente)
  label: string; // "jun/26"
  competencia: string; // "06/2026"
  faturamento: number;
  tributos: number;
  porTipo: Record<string, number>; // guias por grupo: das/darf/iss/iss_rpa/icms/inss/fgts/outro
  carga: number | null; // % (tributos / faturamento); null se não há faturamento
}

/** Indicadores derivados de um intervalo de meses (usado pelo filtro de período). */
export interface PeriodSummary {
  totalFaturamento: number;
  totalTributos: number;
  cargaMedia: number | null; // % no período
  crescimento: number | null; // % do último mês com faturamento vs. o anterior
  periodoLabel: string | null; // intervalo real coberto, ex. "abr/26 – jun/26"
  mediaMensal: number | null; // faturamento médio dos meses faturados
  melhorMes: MonthlyPoint | null; // mês de maior faturamento no período
}

export interface FaturamentoSummary extends PeriodSummary {
  data: MonthlyPoint[];
}

/**
 * Deriva totais e indicadores de pontos mensais já agregados.
 * É puro (não mexe em datas), então roda tanto no servidor quanto no cliente —
 * é o que permite o filtro de período recalcular os cards na hora.
 */
export function summarizePoints(data: MonthlyPoint[]): PeriodSummary {
  const totalFaturamento = data.reduce((s, d) => s + d.faturamento, 0);
  const totalTributos = data.reduce((s, d) => s + d.tributos, 0);
  const cargaMedia =
    totalFaturamento > 0 ? (totalTributos / totalFaturamento) * 100 : null;

  const comFaturamento = data.filter((d) => d.faturamento > 0);
  let crescimento: number | null = null;
  if (comFaturamento.length >= 2) {
    const ultimo = comFaturamento[comFaturamento.length - 1].faturamento;
    const anterior = comFaturamento[comFaturamento.length - 2].faturamento;
    if (anterior > 0) crescimento = ((ultimo - anterior) / anterior) * 100;
  }

  const mediaMensal =
    comFaturamento.length > 0 ? totalFaturamento / comFaturamento.length : null;

  let melhorMes: MonthlyPoint | null = null;
  for (const d of data) {
    if (
      d.faturamento > 0 &&
      (melhorMes === null || d.faturamento > melhorMes.faturamento)
    ) {
      melhorMes = d;
    }
  }

  const periodoLabel =
    data.length === 0
      ? null
      : data.length === 1
        ? data[0].label
        : `${data[0].label} – ${data[data.length - 1].label}`;

  return {
    totalFaturamento,
    totalTributos,
    cargaMedia,
    crescimento,
    periodoLabel,
    mediaMensal,
    melhorMes,
  };
}

export interface DocInput {
  type: DocType;
  competencia: string;
  amount: number | null;
}

export interface RevenueInput {
  competencia: string;
  amount: number;
}

interface Agg {
  key: string;
  competencia: string;
  faturamento: number;
  tributos: number;
  porTipo: Record<string, number>;
}

export const MONTHS_SHOWN = 12;

/**
 * Agrega documentos (tributos) e faturamento por competência (mês/ano).
 * `tributos`/carga somam só os de isTributo (DAS/DARFs/ISS/ICMS); INSS, FGTS e
 * folha ficam fora. Já `porTipo` quebra TODAS as guias com valor por tipo
 * (inclui INSS/FGTS) para o gráfico "Tributos por tipo".
 * Passe os dados de uma empresa (visão por cliente) ou de todas (carteira).
 */
export function buildFaturamento(
  docs: DocInput[],
  revenues: RevenueInput[],
  monthsShown: number = MONTHS_SHOWN,
  // Ignora competências posteriores a este mês (padrão: mês atual). Assim o
  // "período" não soma faturamento de meses que ainda não aconteceram.
  maxKey: string | null = currentCompetenciaKey(),
): FaturamentoSummary {
  const byMonth = new Map<string, Agg>();
  const ensure = (competenciaRaw: string): Agg | null => {
    const key = competenciaKey(competenciaRaw);
    if (!key) return null;
    if (maxKey && key > maxKey) return null; // competência futura: fora do período
    let agg = byMonth.get(key);
    if (!agg) {
      agg = {
        key,
        competencia: normalizeCompetencia(competenciaRaw),
        faturamento: 0,
        tributos: 0,
        porTipo: {},
      };
      byMonth.set(key, agg);
    }
    return agg;
  };

  for (const d of docs) {
    const group = TYPE_TO_GROUP.get(d.type);
    const conta = isTributo(d.type); // entra na carga tributária?
    // Documento/folha sem grupo e fora da carga: não interessa aqui.
    if (!group && !conta) continue;
    const agg = ensure(d.competencia);
    if (!agg) continue;
    const amount = Number(d.amount ?? 0);
    if (conta) agg.tributos += amount; // carga: só isTributo
    // Gráfico por tipo: todas as guias com valor (inclui INSS, FGTS...).
    const gkey = group ?? OUTROS_GROUP_KEY;
    agg.porTipo[gkey] = (agg.porTipo[gkey] ?? 0) + amount;
  }
  for (const r of revenues) {
    const agg = ensure(r.competencia);
    if (agg) agg.faturamento += Number(r.amount);
  }

  const data: MonthlyPoint[] = [...byMonth.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-monthsShown)
    .map((agg) => ({
      key: agg.key,
      label: competenciaShortLabel(agg.competencia),
      competencia: agg.competencia,
      faturamento: agg.faturamento,
      tributos: agg.tributos,
      porTipo: agg.porTipo,
      carga:
        agg.faturamento > 0 ? (agg.tributos / agg.faturamento) * 100 : null,
    }));

  return { data, ...summarizePoints(data) };
}
