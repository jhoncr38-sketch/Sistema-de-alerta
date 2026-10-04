"use client";

import { useState } from "react";
import { ObligationsCalendar, type CalItem } from "@/components/obligations-calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DiaRegua {
  /** YYYY-MM-DD. */
  iso: string;
  /** "seg 05". */
  rotulo: string;
  guias: number;
  /** "R$ 3.200" (compacto) ou "". */
  valor: string;
  /** Sábado/domingo (só visual). */
  fimDeSemana: boolean;
  /** Nome do feriado nacional, se for. */
  feriado: string | null;
  /** Dia com mais guias (destaque laranja). */
  pico: boolean;
  /** Casa "pulada" (o pico fora dos próximos dias): mostra "…". */
  salto: boolean;
}

/**
 * Régua dos próximos vencimentos (Dashboard): quantas guias vencem em cada um
 * dos próximos dias e quanto somam, com o dia de pico em destaque. "Abrir
 * calendário" mostra o mês inteiro (mesmo calendário de antes).
 */
export function ReguaVencimentos({
  dias,
  nota,
  calItems,
}: {
  dias: DiaRegua[];
  nota: string | null;
  calItems: CalItem[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-[10px] border bg-card px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Próximos vencimentos</h2>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-[13px] font-medium text-primary hover:underline"
        >
          Abrir calendário
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-9">
        {dias.map((d) => {
          const vazio = d.guias === 0;
          return (
            <div
              key={d.iso}
              className={cn(
                "rounded-lg p-2",
                d.pico
                  ? "bg-orange-50 ring-1 ring-orange-200 dark:bg-orange-950/30 dark:ring-orange-900"
                  : vazio
                    ? "bg-neutral-50 dark:bg-muted/40"
                    : "bg-muted",
              )}
            >
              <div className="text-[11px] text-muted-foreground">
                {d.salto ? "… " : ""}
                {d.rotulo}
              </div>
              <div
                className={cn(
                  "text-lg leading-tight font-semibold tabular-nums",
                  vazio && "text-neutral-300 dark:text-neutral-600",
                )}
              >
                {d.guias}
              </div>
              <div
                className="truncate text-[11px] text-muted-foreground tabular-nums"
                title={d.feriado ?? undefined}
              >
                {d.valor || (d.feriado ? "feriado" : " ")}
              </div>
            </div>
          );
        })}
      </div>
      {nota ? <p className="mt-2 text-xs text-muted-foreground">{nota}</p> : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogTitle>Calendário de vencimentos</DialogTitle>
          {aberto ? <ObligationsCalendar items={calItems} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
