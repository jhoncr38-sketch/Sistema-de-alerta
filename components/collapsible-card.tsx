"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cartão recolhível com cabeçalho clicável (seta + título + contagem) — no mesmo
 * estilo dos meses da aba Folha. O conteúdo (ex.: uma tabela) é passado como
 * children e renderizado só quando aberto.
 */
export function CollapsibleCard({
  titulo,
  count,
  unidade = "documento",
  defaultOpen = false,
  children,
}: {
  titulo: string;
  count?: number;
  /** Palavra no singular usada na contagem (vira plural com "s"). */
  unidade?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
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
          <span className="font-medium">{titulo}</span>
        </div>
        {count != null ? (
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? unidade : `${unidade}s`}
          </span>
        ) : null}
      </button>

      {open ? <div className="border-t">{children}</div> : null}
    </div>
  );
}
