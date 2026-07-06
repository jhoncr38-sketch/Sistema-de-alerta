"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Editor do teto MENSAL de perguntas à IA de uma empresa (tabela de Empresas do
 * painel). Campo numérico compacto: vazio = padrão global; 0 = ilimitado.
 * Salva ao confirmar. Controle de custo — ver lib/ai/usage.ts.
 */
export function CompanyAiLimit({
  value,
  companyName,
  saveAction,
}: {
  value: number | null;
  companyName: string;
  saveAction: (limit: number | null) => Promise<void>;
}) {
  // "" = padrão global; "0" = ilimitado; "N" = teto.
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const [pending, startTransition] = useTransition();

  const original = value === null ? "" : String(value);
  const changed = raw.trim() !== original;

  function salvar() {
    if (!changed) return;
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Informe um número válido (0 = ilimitado, vazio = padrão).");
      return;
    }
    startTransition(async () => {
      try {
        await saveAction(parsed);
        toast.success(
          parsed === null
            ? `Teto de IA de ${companyName}: padrão.`
            : parsed === 0
              ? `IA ilimitada para ${companyName}.`
              : `Teto de IA de ${companyName}: ${parsed}/mês.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground [&_svg]:size-3.5" aria-hidden>
        <Sparkles />
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
        }}
        placeholder="padrão"
        aria-label={`Teto de perguntas à IA por mês para ${companyName} (0 = ilimitado, vazio = padrão)`}
        title="Perguntas/mês à IA. Vazio = padrão global; 0 = ilimitado."
        className="w-20 rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <button
        type="button"
        onClick={salvar}
        disabled={!changed || pending}
        aria-label="Salvar teto"
        title="Salvar"
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors disabled:opacity-40",
          changed
            ? "bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15"
            : "text-muted-foreground ring-border",
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </button>
    </div>
  );
}
