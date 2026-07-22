"use client";

import { type ReactNode, useState } from "react";
import { CalendarDays, List } from "lucide-react";
import {
  ObligationsCalendar,
  type CalItem,
} from "@/components/obligations-calendar";
import { cn } from "@/lib/utils";

/**
 * "Próximas obrigações" com alternância Lista | Calendário — o calendário entra
 * como um MODO da seção do Dashboard, sem virar uma aba nova (mantém o menu
 * enxuto). A lista (server component com ações) vem como children; o calendário
 * é montado a partir dos dados só quando selecionado.
 */
export function ObligationsView({
  title,
  data,
  children,
}: {
  title: string;
  data: CalItem[];
  children: ReactNode;
}) {
  const [mode, setMode] = useState<"lista" | "calendario">("lista");

  const tab = (value: "lista" | "calendario", label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        mode === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {tab("lista", "Lista", <List className="size-3.5" />)}
          {tab("calendario", "Calendário", <CalendarDays className="size-3.5" />)}
        </div>
      </div>
      {mode === "lista" ? children : <ObligationsCalendar items={data} />}
    </div>
  );
}
