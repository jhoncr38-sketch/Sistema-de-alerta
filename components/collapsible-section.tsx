"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Seção recolhível em formato de Card (mesmo visual dos demais cards da página).
 * Começa fechada mostrando só ícone + título; expande ao clicar no cabeçalho.
 * Usada para tirar da frente formulários grandes que nem sempre estão em uso
 * (ex.: o envio manual de boleto).
 */
export function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="max-w-3xl px-6 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        {icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <span className="flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle ? (
            <span className="block text-xs text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? <div className="mt-5">{children}</div> : null}
    </Card>
  );
}
