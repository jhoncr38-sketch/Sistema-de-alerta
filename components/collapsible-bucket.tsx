"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bloco de obrigações recolhível para o dashboard do contador. Igual em espírito
 * ao CollapsibleCard, mas com o cabeçalho rico do dashboard (ícone colorido de
 * urgência, contagem e total à direita) e um "ver todos" para não abrir de uma
 * vez listas longas.
 *
 * - `preview` (opcional): tabela com as primeiras linhas; quando existe, o bloco
 *   abre mostrando só ela e um botão "ver todos os N" alterna para o conteúdo
 *   completo (`children`). Sem `preview`, mostra `children` direto.
 */
export function CollapsibleBucket({
  icon,
  title,
  count,
  total,
  defaultOpen = false,
  preview,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  /** Total do bloco já formatado (ex.: "R$ 8.102,57"); nulo esconde. */
  total: string | null;
  defaultOpen?: boolean;
  /** Tabela reduzida; quando presente, habilita o "ver todos os N". */
  preview?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const hasPreview = preview != null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90",
          )}
        />
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
        {total ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t">
          {hasPreview && !expanded ? preview : children}
          {hasPreview ? (
            <div className="px-4 py-2.5">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {expanded ? "ver menos" : `ver todos os ${count}`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
