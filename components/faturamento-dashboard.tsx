"use client";

import { useState } from "react";
import { CalendarRange, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { RevenueCharts } from "@/components/revenue-charts";
import { summarizePoints, type MonthlyPoint } from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

const RANGES = [
  { key: "3", label: "3 meses", months: 3 },
  { key: "6", label: "6 meses", months: 6 },
  { key: "12", label: "12 meses", months: 12 },
  { key: "all", label: "Tudo", months: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/**
 * Painel de faturamento com filtro de período interativo: o controle segmentado
 * fatia os meses no próprio cliente, recalculando cards e gráficos na hora (sem
 * recarregar a página). `data` vem do servidor em ordem cronológica crescente.
 */
export function FaturamentoDashboard({
  data,
  emptyMessage,
}: {
  data: MonthlyPoint[];
  emptyMessage: string;
}) {
  // Mostra "Tudo", a menor faixa (3 meses) como piso e qualquer faixa que
  // realmente recorte o histórico — evita botões redundantes (ex.: "12 meses"
  // igual a "Tudo" quando há poucos meses) sem nunca esconder o filtro.
  const ranges = RANGES.filter(
    (r) => r.months === null || r.key === "3" || r.months < data.length,
  );
  // Some só quando não há o que comparar (0 ou 1 mês lançado).
  const showFilter = data.length >= 2;
  const defaultKey: RangeKey = data.length > 12 ? "12" : "all";
  const [rangeKey, setRangeKey] = useState<RangeKey>(defaultKey);

  const months = RANGES.find((r) => r.key === rangeKey)?.months ?? null;
  const shown = months === null ? data : data.slice(-months);

  const {
    totalFaturamento,
    totalTributos,
    cargaMedia,
    crescimento,
    periodoLabel,
    mediaMensal,
    melhorMes,
  } = summarizePoints(shown);

  const hasData = shown.length > 0;

  return (
    <div className="space-y-6">
      {showFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarRange className="size-4" />
            <span>Período</span>
          </div>
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {ranges.map((r) => {
              const active = r.key === rangeKey;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRangeKey(r.key)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Faturamento no período"
          value={formatCurrency(totalFaturamento)}
          sub={periodoLabel ?? "sem lançamentos"}
        />
        <MetricCard
          label="Tributos no período"
          value={formatCurrency(totalTributos)}
          sub="DAS, DARF, INSS, ISS"
        />
        <MetricCard
          label="Carga tributária média"
          value={cargaMedia === null ? "—" : formatPct(cargaMedia)}
          sub="imposto / faturamento"
          tone={
            cargaMedia === null
              ? "muted"
              : cargaMedia >= 20
                ? "danger"
                : cargaMedia >= 12
                  ? "warning"
                  : "success"
          }
        />
        <MetricCard
          label="Faturamento médio/mês"
          value={mediaMensal === null ? "—" : formatCurrency(mediaMensal)}
          sub="média dos meses faturados"
        />
        <MetricCard
          label="Melhor mês"
          value={
            melhorMes === null ? "—" : formatCurrency(melhorMes.faturamento)
          }
          sub={
            melhorMes === null
              ? "sem faturamento"
              : `maior faturamento · ${melhorMes.label}`
          }
          tone={melhorMes === null ? "muted" : "info"}
        />
        <MetricCard
          label="Crescimento no último mês"
          value={
            crescimento === null
              ? "—"
              : `${crescimento >= 0 ? "+" : ""}${formatPct(crescimento)}`
          }
          sub="vs. mês anterior"
          tone={
            crescimento === null
              ? "muted"
              : crescimento >= 0
                ? "success"
                : "danger"
          }
          icon={
            crescimento === null ? undefined : crescimento >= 0 ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )
          }
        />
      </div>

      {hasData ? (
        <RevenueCharts data={shown} />
      ) : (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </Card>
      )}
    </div>
  );
}
