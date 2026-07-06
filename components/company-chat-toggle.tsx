"use client";

import { useTransition } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Interruptor por empresa da aba "Converse com sua empresa", usado na tabela de
 * Empresas do painel. Clique único, reversível: liga/desliga a aba de conversa
 * daquela empresa. Não afeta o assistente flutuante ("Dúvidas?").
 */
export function CompanyChatToggle({
  enabled,
  companyName,
  toggleAction,
}: {
  enabled: boolean;
  companyName: string;
  toggleAction: (enabled: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const next = !enabled;
    startTransition(async () => {
      try {
        await toggleAction(next);
        toast.success(
          next
            ? `Conversa com a empresa ligada para ${companyName}.`
            : `Conversa com a empresa desligada para ${companyName}.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao atualizar.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={enabled}
      title={
        enabled
          ? "Conversa com a empresa ligada — clique para desligar"
          : "Conversa com a empresa desligada — clique para ligar"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-60",
        enabled
          ? "bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15"
          : "bg-muted text-muted-foreground ring-border hover:bg-muted/70",
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <MessageCircle className={cn("size-3.5", !enabled && "opacity-60")} />
      )}
      {enabled ? "Ligado" : "Desligado"}
    </button>
  );
}
