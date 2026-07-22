"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Urgency } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Item do calendário — uma obrigação com vencimento (dado já serializável). */
export interface CalItem {
  id: string;
  dueDate: string; // YYYY-MM-DD
  cliente: string;
  tipo: string;
  amount: number | null;
  urgency: Urgency;
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WD_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
/** Ordem de urgência (menor = mais urgente), para o chip mostrar o pior do dia. */
const URG_ORDER: Record<Urgency, number> = {
  vencido: 0, vence_hoje: 1, proximos_3: 2, proximos_7: 3,
  aguardando: 4, em_dia: 5, pago: 6,
};

type Tom = "vencido" | "avencer" | "emdia";
/** Agrupa a urgência em 3 tons semânticos (respeitam o tema via variantes dark). */
function tomOf(u: Urgency): Tom {
  if (u === "vencido" || u === "vence_hoje") return "vencido";
  if (u === "proximos_3" || u === "proximos_7") return "avencer";
  return "emdia";
}
/** Pílula do dia. */
const CHIP: Record<Tom, string> = {
  vencido: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  avencer: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  emdia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};
const DOT: Record<Tom, string> = {
  vencido: "bg-red-500",
  avencer: "bg-amber-500",
  emdia: "bg-emerald-500",
};
/** Fundo suave da linha de detalhe. */
const ROW_TINT: Record<Tom, string> = {
  vencido: "bg-red-50 dark:bg-red-950/25",
  avencer: "bg-amber-50 dark:bg-amber-950/25",
  emdia: "bg-emerald-50 dark:bg-emerald-950/25",
};
const TEXT_TONE: Record<Tom, string> = {
  vencido: "text-red-600 dark:text-red-400",
  avencer: "text-amber-600 dark:text-amber-400",
  emdia: "text-emerald-600 dark:text-emerald-400",
};
const STATUS_LABEL: Record<Tom, string> = {
  vencido: "Vencido",
  avencer: "A vencer",
  emdia: "Em dia",
};

/** Nome curto para o chip (cliente ou tipo). "DARF - PIS/COFINS" -> "DARF". */
function shortName(c: string): string {
  const first = c.split(/[\s\-–·]/)[0] || c;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}
function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}
function weekdayShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WD_SHORT[new Date(y, m - 1, d).getDay()];
}

/**
 * Calendário mensal das obrigações — o "modo Calendário" do Dashboard e do
 * portal. Células com pílulas por dia, hoje destacado e detalhe do dia. As cores
 * saem dos tokens do tema (primary/card/border) + tons semânticos, então ele
 * obedece Claro, Escuro e Sereno automaticamente. Só monta ao trocar de aba
 * (não renderiza no servidor), então usar `new Date()` aqui é seguro.
 */
export function ObligationsCalendar({
  items,
  showClient = true,
}: {
  items: CalItem[];
  /** Contador: chip/detalhe mostram o cliente. Cliente (portal): o tipo da guia. */
  showClient?: boolean;
}) {
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      const arr = map.get(it.dueDate) ?? [];
      arr.push(it);
      map.set(it.dueDate, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => URG_ORDER[a.urgency] - URG_ORDER[b.urgency]);
    }
    return map;
  }, [items]);

  const startWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}-`;
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const ymd = (day: number) => `${monthPrefix}${String(day).padStart(2, "0")}`;
  const label = (it: CalItem) => (showClient ? it.cliente : it.tipo);

  function step(delta: number) {
    setSelected(null);
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }
  function goToday() {
    setSelected(null);
    setView({ y: today.getFullYear(), m: today.getMonth() });
  }

  // Células (com preenchimento antes e depois para a grade fechar as semanas).
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const listed = selected
    ? byDay.get(selected) ?? []
    : items
        .filter((it) => it.dueDate.startsWith(monthPrefix))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      {/* Navegação + mês */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
          >
            Hoje
          </button>
        </div>
        <span className="text-sm font-bold">
          {MONTHS[view.m]} {view.y}
        </span>
      </div>

      {/* Legenda */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(["vencido", "avencer", "emdia"] as Tom[]).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <span className={cn("size-2 rounded-full", DOT[t])} />
            {STATUS_LABEL[t]}
          </span>
        ))}
      </div>

      {/* Cabeçalho dos dias da semana */}
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-center text-[10px] font-bold tracking-wide text-muted-foreground/70"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Grade */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day === null) {
            return (
              <div key={`b${i}`} className="min-h-[72px] rounded-xl bg-muted/20" />
            );
          }
          const key = ymd(day);
          const dayItems = byDay.get(key) ?? [];
          const has = dayItems.length > 0;
          const isToday = key === todayYmd;
          const isSel = key === selected;
          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => setSelected((s) => (s === key ? null : key))}
              className={cn(
                "flex min-h-[72px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition-colors",
                has ? "cursor-pointer bg-card hover:bg-muted/50" : "cursor-default bg-muted/20",
                isToday && "bg-primary/5",
                isSel && "ring-2 ring-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : "font-semibold text-foreground/80",
                )}
              >
                {day}
              </span>
              <div className="flex w-full flex-col gap-1">
                {dayItems.slice(0, 2).map((it) => (
                  <span
                    key={it.id}
                    className={cn(
                      "max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                      CHIP[tomOf(it.urgency)],
                    )}
                    title={`${it.cliente} · ${it.tipo}`}
                  >
                    {shortName(label(it))}
                  </span>
                ))}
                {dayItems.length > 2 ? (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    +{dayItems.length - 2} mais
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalhe: dia selecionado ou o mês inteiro */}
      <div className="mt-4 border-t pt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {selected
              ? `Vencimentos · ${weekdayShort(selected)}, ${dayOf(selected)} de ${MONTHS[view.m]}`
              : `Vencimentos de ${MONTHS[view.m]}`}
          </span>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              ver o mês
            </button>
          ) : null}
        </div>
        {listed.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground/70">
            Nenhum vencimento {selected ? "neste dia" : "neste mês"}.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {listed.map((it) => {
              const tom = tomOf(it.urgency);
              return (
                <div
                  key={it.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3",
                    ROW_TINT[tom],
                  )}
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", DOT[tom])} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">
                      {showClient ? `${it.cliente} · ${it.tipo}` : it.tipo}
                    </div>
                    <div className={cn("text-[11px] font-semibold", TEXT_TONE[tom])}>
                      {STATUS_LABEL[tom]} · {dayOf(it.dueDate)}/{String(view.m + 1).padStart(2, "0")}
                    </div>
                  </div>
                  {it.amount != null ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums">
                      {formatCurrency(it.amount)}
                    </span>
                  ) : null}
                  <a
                    href={`/api/documents/${it.id}/download`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Download className="size-3.5" />
                    <span className="hidden sm:inline">Baixar</span>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
