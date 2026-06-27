"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreviewButton } from "@/components/file-preview-button";
import { PaidToggle } from "@/components/paid-toggle";
import { docTypeLabel } from "@/lib/constants";
import { parseCompetencia } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesLabel(competencia: string | null): string {
  if (!competencia) return "Sem competência";
  const m = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return competencia;
  return `${MESES_LONGOS[Number(m[1]) - 1] ?? m[1]} / ${m[2]}`;
}

interface Grupo {
  competencia: string | null;
  docs: DocumentWithCompany[];
  total: number;
}

/** Agrupa por competência, do mês mais recente para o mais antigo. */
function agrupar(documents: DocumentWithCompany[]): Grupo[] {
  const grupos: Grupo[] = [];
  const idx = new Map<string, number>();
  for (const d of documents) {
    const key = d.competencia ?? "—";
    let i = idx.get(key);
    if (i === undefined) {
      i = grupos.length;
      idx.set(key, i);
      grupos.push({ competencia: d.competencia, docs: [], total: 0 });
    }
    grupos[i].docs.push(d);
    grupos[i].total += d.amount ?? 0;
  }
  return grupos.sort((a, b) => {
    const da = parseCompetencia(a.competencia ?? "")?.getTime() ?? -Infinity;
    const db = parseCompetencia(b.competencia ?? "")?.getTime() ?? -Infinity;
    return db - da;
  });
}

/** Um mês de boletos pagos: cabeçalho clicável que recolhe/expande as linhas. */
function MesBoletos({ grupo, defaultOpen }: { grupo: Grupo; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "" : "-rotate-90",
            )}
          />
          <span className="font-medium">{mesLabel(grupo.competencia)}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {grupo.docs.length} {grupo.docs.length === 1 ? "boleto" : "boletos"} ·{" "}
          {formatCurrency(grupo.total)}
        </span>
      </button>

      {open ? (
        <ul className="divide-y border-t">
          {grupo.docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {docTypeLabel(d.type)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {d.due_date ? `Venc. ${formatDate(d.due_date)} · ` : ""}
                  {d.amount != null ? formatCurrency(d.amount) : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <FilePreviewButton
                  docId={d.id}
                  fileName={`${docTypeLabel(d.type)}${d.competencia ? ` · ${d.competencia}` : ""}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a href={`/api/documents/${d.id}/download`}>
                      <Download />
                      <span className="hidden sm:inline">Baixar</span>
                    </a>
                  }
                />
                <PaidToggle docId={d.id} paid />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Histórico de boletos pagos: seção recolhível com um card por competência
 * dentro (mês mais recente já aberto). Mantém a tela leve — os pagos não
 * disputam espaço com o que ainda falta pagar.
 */
export function BoletosPagos({
  documents,
  total,
  defaultOpen = false,
}: {
  documents: DocumentWithCompany[];
  total: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const grupos = agrupar(documents);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "" : "-rotate-90",
            )}
          />
          <span className="font-semibold">Pagos</span>
          <span className="text-sm text-muted-foreground">
            ({documents.length})
          </span>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatCurrency(total)} quitados
        </span>
      </button>

      {open ? (
        <div className="space-y-3">
          {grupos.map((g, i) => (
            <MesBoletos
              key={g.competencia ?? "—"}
              grupo={g}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
