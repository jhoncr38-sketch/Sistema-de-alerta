"use client";

import type { ReactNode } from "react";
import { MESES_CURTOS } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** Estado visual de um mês no mapa. */
export type EstadoMes =
  | "pago" // tudo pago / folha disponível
  | "pendente" // mês com guia atrasada
  | "corrente" // mês atual sem pendência
  | "preparo" // folha do mês atual ainda não publicada
  | "vazio"; // a vir / sem nada

const CELULA: Record<EstadoMes, string> = {
  pago: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  pendente: "bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  corrente: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  preparo: "bg-primary/12 text-primary",
  vazio: "bg-muted text-neutral-400 dark:text-neutral-500",
};

/**
 * Mapa compacto dos 12 meses do ano (boletos pagos, folhas publicadas). Com
 * `onSelecionar`, cada mês é clicável e filtra a lista (clicar de novo limpa);
 * sem ele, o mapa é só para olhar (Início).
 */
export function MapaAno({
  rotulo,
  valor,
  estados,
  selecionado,
  onSelecionar,
  legenda = [],
  acao,
}: {
  /** "Pago em 2026" / "Folhas de 2026". */
  rotulo: string;
  /** Valor em destaque sob o rótulo ("R$ 45.010,36" / "9 de 12"). */
  valor: string;
  /** Estado de cada mês (índice 0 = janeiro). */
  estados: EstadoMes[];
  /** Mês selecionado (1..12) ou null. */
  selecionado?: number | null;
  onSelecionar?: (mes: number | null) => void;
  legenda?: { estado: EstadoMes; texto: string }[];
  /** Link à direita (ex.: "22 pagos ›"); no celular fica na linha de cima. */
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border bg-card px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-baseline justify-between gap-2 leading-tight sm:block">
        <div>
          <div className="text-[11px] text-muted-foreground">{rotulo}</div>
          <div className="text-base font-semibold tabular-nums">{valor}</div>
        </div>
        {acao ? <div className="sm:hidden">{acao}</div> : null}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-12 gap-1">
        {estados.map((estado, i) => {
          const mes = i + 1;
          const ativo = selecionado === mes;
          const Celula = onSelecionar ? "button" : "div";
          return (
            <Celula
              key={mes}
              {...(onSelecionar
                ? {
                    type: "button" as const,
                    "aria-pressed": ativo,
                    "aria-label": `${MESES_CURTOS[i]}${ativo ? " (selecionado)" : ""}`,
                    onClick: () => onSelecionar(ativo ? null : mes),
                  }
                : {})}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "flex h-4 w-full items-center justify-center rounded-[5px] text-[11px] font-medium sm:h-[26px]",
                  CELULA[estado],
                  ativo && "ring-2 ring-foreground",
                )}
              >
                <span className="hidden sm:inline">{MESES_CURTOS[i]}</span>
              </span>
              <span className="text-[10px] text-muted-foreground uppercase sm:hidden">
                {MESES_CURTOS[i][0]}
              </span>
            </Celula>
          );
        })}
      </div>

      {acao ? <div className="hidden shrink-0 sm:block">{acao}</div> : null}

      <div className={cn("hidden shrink-0 flex-col gap-0.5", legenda.length > 0 && "md:flex")}>
        {legenda.map((l) => (
          <span
            key={l.estado}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className={cn("size-2 rounded-[2px]", CELULA[l.estado])} />
            {l.texto}
          </span>
        ))}
      </div>
    </div>
  );
}
