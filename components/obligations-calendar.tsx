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

/** Cor da bolinha por urgência (vermelho vencido, âmbar a vencer, cinza em dia). */
function dotColor(u: Urgency): string {
  if (u === "vencido") return "bg-red-500";
  if (u === "vence_hoje") return "bg-amber-500";
  if (u === "proximos_3" || u === "proximos_7") return "bg-amber-400";
  return "bg-slate-400";
}

/** Dia (número) a partir de "YYYY-MM-DD", sem criar Date (evita deslocar por fuso). */
function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/**
 * Calendário mensal das obrigações — o "modo Calendário" do Dashboard. Só monta
 * quando o contador troca de aba (não é renderizado no servidor), então usar
 * `new Date()` aqui não causa mismatch de hidratação.
 */
export function ObligationsCalendar({ items }: { items: CalItem[] }) {
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
    return map;
  }, [items]);

  const startWeekday = new Date(view.y, view.m, 1).getDay(); // 0 = Dom
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}-`;
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const ymd = (day: number) =>
    `${monthPrefix}${String(day).padStart(2, "0")}`;

  function step(delta: number) {
    setSelected(null);
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
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
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[10px] font-medium uppercase text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
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
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-xs transition-colors",
                has
                  ? "cursor-pointer hover:bg-muted"
                  : "cursor-default text-muted-foreground/50",
                isSel && "bg-primary/10 ring-1 ring-primary",
                isToday && !isSel && "ring-1 ring-border",
              )}
            >
              <span className={cn("tabular-nums", isToday && "font-semibold text-primary")}>
                {day}
              </span>
              <span className="flex h-1.5 gap-0.5">
                {has
                  ? dayItems.slice(0, 3).map((it, j) => (
                      <span
                        key={j}
                        className={cn("size-1.5 rounded-full", dotColor(it.urgency))}
                      />
                    ))
                  : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {selected
            ? `Vencimentos de ${dayOf(selected)}/${String(view.m + 1).padStart(2, "0")}`
            : `Vencimentos de ${MONTHS[view.m]}`}
          {selected ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-2 text-primary hover:underline"
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
                  <strong className="font-medium">{it.cliente}</strong> · {it.tipo}
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
