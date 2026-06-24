"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import type { MonthlyPoint } from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";

export type { MonthlyPoint };

/** Menos meses em telas estreitas (celular) para os rótulos não se sobreporem. */
function useMaxMonths(): number {
  // SSR e 1º render no cliente usam 12 (evita mismatch de hidratação);
  // o efeito ajusta para 6 no celular depois de montar.
  const [max, setMax] = useState(12);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setMax(mq.matches ? 6 : 12);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return max;
}

/** 1240 -> "1,2k"; 980 -> "980". Rótulo curto para barras. */
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) {
    const k = v / 1_000;
    return `${k.toFixed(k >= 100 ? 0 : 1).replace(".", ",")}k`;
  }
  return String(Math.round(v));
}

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

/** Cor da carga tributária por faixa (referência, não regra fiscal). */
function cargaTone(carga: number | null): string {
  if (carga === null) return "text-muted-foreground";
  if (carga >= 20) return "text-red-600 dark:text-red-400";
  if (carga >= 12) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function HoverCaption({ point }: { point: MonthlyPoint | null }) {
  if (!point) {
    return (
      <p className="text-xs text-muted-foreground">
        Toque ou passe o mouse em um mês para ver os valores.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      <strong className="text-foreground">{point.label}</strong> · Faturamento{" "}
      {formatCurrency(point.faturamento)} · Tributos{" "}
      {formatCurrency(point.tributos)} · Carga{" "}
      <span className={cargaTone(point.carga)}>
        {point.carga === null ? "—" : formatPct(point.carga)}
      </span>
    </p>
  );
}

function FaturamentoBars({
  data,
  hovered,
  onHover,
}: {
  data: MonthlyPoint[];
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  const max = Math.max(...data.map((d) => d.faturamento), 1);
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Faturamento por mês</h3>
        <span className="text-xs text-muted-foreground">R$</span>
      </div>
      <div
        className="flex h-44 items-end gap-1.5"
        onMouseLeave={() => onHover(null)}
      >
        {data.map((d, i) => {
          // Até 88% para sobrar espaço ao rótulo de valor acima da barra.
          const pct = Math.max(2, (d.faturamento / max) * 88);
          const active = hovered === i;
          return (
            <div
              key={d.key}
              className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1"
              onPointerEnter={() => onHover(i)}
              onClick={() => onHover(i)}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {compact(d.faturamento)}
              </span>
              <div
                className={`w-full rounded-t transition-colors ${
                  active ? "bg-primary" : "bg-primary/70"
                }`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {d.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CargaLine({
  data,
  hovered,
  onHover,
}: {
  data: MonthlyPoint[];
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  const cargas = data
    .map((d) => d.carga)
    .filter((c): c is number => c !== null);
  const maxCarga = Math.max(...cargas, 1);
  const n = data.length;

  // Coordenadas em 0..100 (viewBox casa com left%/top% por preserveAspectRatio=none).
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (carga: number) => 8 + (1 - carga / maxCarga) * 84;

  // Segmentos de pontos não-nulos consecutivos (quebra a linha em meses sem faturamento).
  const segments: { i: number; cx: number; cy: number }[][] = [];
  let current: { i: number; cx: number; cy: number }[] = [];
  data.forEach((d, i) => {
    if (d.carga === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ i, cx: x(i), cy: y(d.carga) });
    }
  });
  if (current.length) segments.push(current);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Carga tributária por mês</h3>
        <span className="text-xs text-muted-foreground">imposto / faturamento</span>
      </div>
      <div
        className="relative h-44"
        onMouseLeave={() => onHover(null)}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          {segments.map((seg, si) => (
            <polyline
              key={si}
              points={seg.map((p) => `${p.cx},${p.cy}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-primary"
            />
          ))}
        </svg>
        {/* Pontos + colunas de hover sobre a linha */}
        <div className="absolute inset-0 flex">
          {data.map((d, i) => {
            const active = hovered === i;
            return (
              <div
                key={d.key}
                className="relative flex-1 cursor-default"
                onPointerEnter={() => onHover(i)}
                onClick={() => onHover(i)}
              >
                {d.carga !== null ? (
                  <span
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary transition-all ${
                      active ? "size-3" : "size-2"
                    }`}
                    style={{ left: "50%", top: `${y(d.carga)}%` }}
                  />
                ) : null}
                {active && d.carga !== null ? (
                  <span
                    className="absolute -translate-x-1/2 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"
                    style={{ left: "50%", top: `${y(d.carga) - 4}%` }}
                  >
                    {formatPct(d.carga)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1.5">
        {data.map((d) => (
          <div
            key={d.key}
            className="flex-1 text-center text-[10px] text-muted-foreground"
          >
            {d.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RevenueCharts({ data }: { data: MonthlyPoint[] }) {
  const maxMonths = useMaxMonths();
  const shown = data.slice(-maxMonths);
  const [hovered, setHovered] = useState<number | null>(null);

  // `shown[hovered] ?? null` já protege índice fora de faixa ao trocar de breakpoint.
  const point = hovered === null ? null : (shown[hovered] ?? null);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <FaturamentoBars data={shown} hovered={hovered} onHover={setHovered} />
        <CargaLine data={shown} hovered={hovered} onHover={setHovered} />
      </div>
      <HoverCaption point={point} />
    </div>
  );
}
