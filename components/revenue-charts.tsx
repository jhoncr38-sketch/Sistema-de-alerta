"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { TRIBUTO_GROUPS, type MonthlyPoint } from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";

/** Cor de cada grupo de guia (paleta do tema + extras; clara/escura). */
const GROUP_COLOR: Record<string, string> = {
  das: "bg-chart-1",
  darf_irpj: "bg-cyan-500",
  darf_piscofins: "bg-violet-500",
  darf_csll: "bg-amber-500",
  iss: "bg-chart-2",
  iss_rpa: "bg-teal-500",
  icms: "bg-chart-3",
  inss: "bg-chart-4",
  fgts: "bg-pink-500",
  outro: "bg-slate-400",
};

/** Grupos na ordem de empilhamento (de baixo p/ cima) e da legenda. */
const STACK_GROUPS: { key: string; label: string }[] = TRIBUTO_GROUPS.map(
  (g) => ({ key: g.key, label: g.label }),
);

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

/** 1240 -> "1,24k"; 24950,2 -> "24,95k"; 980 -> "980". Rótulo curto para barras.
 *  Uma casa decimal a mais que o usual, para não perder precisão no arredondamento
 *  (ex.: 24.950,2 vira "24,95k" em vez de arredondar para "25,0k"). */
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (v >= 1_000) {
    const k = v / 1_000;
    return `${k.toFixed(k >= 100 ? 1 : 2).replace(".", ",")}k`;
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

/** Barras empilhadas: todas as guias do mês por tipo (inclui INSS, FGTS...). */
function TributosPorTipo({
  data,
  hovered,
  onHover,
}: {
  data: MonthlyPoint[];
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  // Total de guias do mês = soma de todos os tipos lançados (inclui INSS, FGTS;
  // por isso ≠ d.tributos, que é só a carga tributária).
  const monthTotal = (d: MonthlyPoint) =>
    STACK_GROUPS.reduce((s, g) => s + (d.porTipo[g.key] ?? 0), 0);
  const max = Math.max(...data.map(monthTotal), 1);
  const hasGuias = data.some((d) => monthTotal(d) > 0);

  // Só mostra na legenda/pilha os grupos que têm algum valor no período.
  const groups = STACK_GROUPS.filter((g) =>
    data.some((d) => (d.porTipo[g.key] ?? 0) > 0),
  );

  // Mês em foco (ou o período inteiro, quando nada está sob o cursor/toque).
  const point = hovered === null ? null : (data[hovered] ?? null);
  const groupValue = (key: string) =>
    point
      ? (point.porTipo[key] ?? 0)
      : data.reduce((s, d) => s + (d.porTipo[key] ?? 0), 0);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Tributos por tipo</h3>
        <span className="text-xs text-muted-foreground">R$</span>
      </div>

      {hasGuias ? (
        <>
          <div
            className="flex h-44 items-end gap-1.5"
            onMouseLeave={() => onHover(null)}
          >
            {data.map((d, i) => {
              const active = hovered === i;
              const total = monthTotal(d);
              const barPct = total > 0 ? Math.max(2, (total / max) * 88) : 0;
              return (
                <div
                  key={d.key}
                  className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-1"
                  onPointerEnter={() => onHover(i)}
                  onClick={() => onHover(i)}
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {total > 0 ? compact(total) : ""}
                  </span>
                  <div
                    className={`flex w-full flex-col-reverse overflow-hidden rounded-t transition-opacity ${
                      hovered !== null && !active ? "opacity-60" : "opacity-100"
                    }`}
                    style={{ height: `${barPct}%` }}
                  >
                    {groups.map((g) => {
                      const v = d.porTipo[g.key] ?? 0;
                      if (v <= 0 || total <= 0) return null;
                      return (
                        <div
                          key={g.key}
                          className={`shrink-0 ${GROUP_COLOR[g.key] ?? "bg-muted-foreground"}`}
                          style={{ height: `${(v / total) * 100}%` }}
                        />
                      );
                    })}
                  </div>
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

          {/* Legenda que vira leitura do mês em foco (valor por tributo). */}
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              {point ? (
                <>
                  <strong className="text-foreground">{point.label}</strong> · por
                  tributo
                </>
              ) : (
                "Total do período por tributo"
              )}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {groups.map((g) => (
                <span
                  key={g.key}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    className={`size-2.5 shrink-0 rounded-sm ${GROUP_COLOR[g.key] ?? "bg-muted-foreground"}`}
                  />
                  {g.label}
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(groupValue(g.key))}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-44 items-center justify-center text-center text-xs text-muted-foreground">
          Nenhum tributo lançado no período.
        </div>
      )}
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
      <TributosPorTipo data={shown} hovered={hovered} onHover={setHovered} />
      <HoverCaption point={point} />
    </div>
  );
}
