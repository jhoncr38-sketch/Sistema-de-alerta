"use client";

import { useState } from "react";
import {
  BarChart3,
  CalendarRange,
  DollarSign,
  Percent,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { RevenueCharts } from "@/components/revenue-charts";
import { summarizePoints, type MonthlyPoint } from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

const selectClass =
  "h-8 rounded-lg border border-input bg-card px-2 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Painel de faturamento com filtro de período interativo: o intervalo "De … até"
 * recorta qualquer janela de meses no próprio cliente, recalculando cards e
 * gráficos na hora (sem recarregar). `data` vem do servidor em ordem crescente.
 */
export function FaturamentoDashboard({
  data,
  emptyMessage,
}: {
  data: MonthlyPoint[];
  emptyMessage: string;
}) {
  // Filtro por mês/ano: o usuário escolhe a competência inicial e a final.
  // Some só quando não há o que comparar (0 ou 1 mês lançado).
  const showFilter = data.length >= 2;
  const lastIdx = data.length - 1;
  const keys = data.map((d) => d.key);
  const idxOf = (k: string) => keys.indexOf(k);

  const [startKey, setStartKey] = useState(data[0]?.key ?? "");
  const [endKey, setEndKey] = useState(data[lastIdx]?.key ?? "");

  // Índices válidos, sempre ordenados (início ≤ fim), tolerando estado inicial.
  const rawStart = idxOf(startKey) === -1 ? 0 : idxOf(startKey);
  const rawEnd = idxOf(endKey) === -1 ? lastIdx : idxOf(endKey);
  const a = Math.min(rawStart, rawEnd);
  const b = Math.max(rawStart, rawEnd);
  const isFull = a === 0 && b === lastIdx;
  const shown = data.slice(a, b + 1);

  // Ao mexer numa ponta, empurra a outra se passar dela (mantém início ≤ fim).
  const handleStart = (k: string) => {
    setStartKey(k);
    if (idxOf(k) > idxOf(endKey)) setEndKey(k);
  };
  const handleEnd = (k: string) => {
    setEndKey(k);
    if (idxOf(k) < idxOf(startKey)) setStartKey(k);
  };
  const resetAll = () => {
    setStartKey(data[0].key);
    setEndKey(data[lastIdx].key);
  };

  const {
    totalFaturamento,
    totalTributos,
    cargaMedia,
    crescimento,
    periodoLabel,
    mediaMensal,
  } = summarizePoints(shown);

  const hasData = shown.length > 0;
  const receitaLiquida = totalFaturamento - totalTributos;

  return (
    <div className="space-y-6">
      {showFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarRange className="size-4" />
            <span>Período</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Mês inicial"
              value={data[a]?.key}
              onChange={(e) => handleStart(e.target.value)}
              className={selectClass}
            >
              {data.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">até</span>
            <select
              aria-label="Mês final"
              value={data[b]?.key}
              onChange={(e) => handleEnd(e.target.value)}
              className={selectClass}
            >
              {data.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            {!isFull ? (
              <button
                type="button"
                onClick={resetAll}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline"
              >
                Tudo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Faturamento no período"
          value={formatCurrency(totalFaturamento)}
          sub={periodoLabel ?? "sem lançamentos"}
          tone="info"
          icon={<DollarSign />}
        />
        <MetricCard
          label="Tributos no período"
          value={formatCurrency(totalTributos)}
          sub="DAS, DARF, ISS, ICMS"
          tone="danger"
          icon={<Receipt />}
        />
        <MetricCard
          label="Receita líquida"
          value={formatCurrency(receitaLiquida)}
          sub="faturamento − tributos"
          tone={receitaLiquida >= 0 ? "success" : "danger"}
          icon={<Wallet />}
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
          icon={<Percent />}
        />
        <MetricCard
          label="Faturamento médio/mês"
          value={mediaMensal === null ? "—" : formatCurrency(mediaMensal)}
          sub="média dos meses faturados"
          tone="info"
          icon={<BarChart3 />}
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
              <TrendingUp />
            ) : (
              <TrendingDown />
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
