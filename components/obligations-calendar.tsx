"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
/** Ordem de urgência (menor = mais urgente), para o chip mostrar o pior do dia. */
const URG_ORDER: Record<Urgency, number> = {
  vencido: 0, vence_hoje: 1, proximos_3: 2, proximos_7: 3,
  aguardando: 4, em_dia: 5, pago: 6,
};

/** Cor da bolinha (usada na lista de detalhe). */
function dotColor(u: Urgency): string {
  if (u === "vencido" || u === "vence_hoje") return "bg-red-500";
  if (u === "proximos_3" || u === "proximos_7") return "bg-amber-500";
  return "bg-emerald-500";
}

/** Chip do dia (tinta suave por urgência, na paleta do app). */
function chipClass(u: Urgency): string {
  if (u === "vencido" || u === "vence_hoje")
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (u === "proximos_3" || u === "proximos_7")
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

/** Nome curto do cliente para caber no chip do dia. */
function shortName(c: string): string {
  const first = c.split(/[\s\-–]/)[0] || c;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

/** Dia (número) a partir de "YYYY-MM-DD", sem criar Date (evita deslocar por fuso). */
function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/**
 * Calendário mensal das obrigações — o "modo Calendário" do Dashboard. Cada dia
 * mostra um chip com o cliente da guia mais urgente (+N se houver mais); o dia de
 * hoje fica destacado. Só monta quando o contador troca de aba (não renderiza no
 * servidor), então usar `new Date()` aqui não causa mismatch de hidratação.
 */
export function ObligationsCalendar({
  items,
  showClient = true,
}: {
  items: CalItem[];
  /** Contador: chip mostra o cliente. Cliente (portal): chip mostra o tipo da guia. */
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

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const listed = selected
    ? byDay.get(selected) ?? []
    : items
        .filter((it) => it.dueDate.startsWith(monthPrefix))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-md border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-md border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
          >
            Hoje
          </button>
        </div>
        <span className="text-sm font-medium">
          {MONTHS[view.m]} {view.y}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-card py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} className="bg-card" />;
          const key = ymd(day);
          const dayItems = byDay.get(key) ?? [];
          const has = dayItems.length > 0;
          const isToday = key === todayYmd;
          const isSel = key === selected;
          const top = dayItems[0];
          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => setSelected((s) => (s === key ? null : key))}
              className={cn(
                "flex min-h-[58px] flex-col items-center gap-1 bg-card px-1 pb-1 pt-1.5 transition-colors",
                has ? "cursor-pointer hover:bg-muted/60" : "cursor-default",
                isToday && "bg-primary/5",
                isSel && "bg-primary/10 ring-1 ring-inset ring-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : has
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground/50",
                )}
              >
                {day}
              </span>
              {has ? (
                <span
                  className={cn(
                    "max-w-full truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight",
                    chipClass(top.urgency),
                  )}
                  title={showClient ? `${top.cliente} · ${top.tipo}` : top.tipo}
                >
                  {showClient ? shortName(top.cliente) : shortName(top.tipo)}
                </span>
              ) : null}
              {dayItems.length > 1 ? (
                <span className="text-[8px] font-medium text-muted-foreground">
                  +{dayItems.length - 1} mais
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t pt-3">
        <p className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {selected
              ? `Vencimentos de ${dayOf(selected)}/${String(view.m + 1).padStart(2, "0")}`
              : `Vencimentos de ${MONTHS[view.m]}`}
          </span>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="font-medium text-primary hover:underline"
            >
              ver o mês todo
            </button>
          ) : null}
        </p>
        {listed.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">
            Nenhum vencimento {selected ? "neste dia" : "neste mês"}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {listed.map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-xs">
                <span className={cn("size-2 shrink-0 rounded-full", dotColor(it.urgency))} />
                <span className="w-9 shrink-0 tabular-nums text-muted-foreground">
                  {dayOf(it.dueDate)}/{String(view.m + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {showClient ? (
                    <>
                      <strong className="font-medium">{it.cliente}</strong> ·{" "}
                      {it.tipo}
                    </>
                  ) : (
                    <strong className="font-medium">{it.tipo}</strong>
                  )}
                </span>
                {it.amount != null ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(it.amount)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
