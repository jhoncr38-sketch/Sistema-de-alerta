"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Interruptor } from "@/components/interruptor";

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
    <Interruptor
      ligado={enabled}
      onClick={handleClick}
      disabled={pending}
      rotulo={`Converse com sua empresa — ${companyName}`}
      title={enabled ? "Ligado — clique para desligar" : "Desligado — clique para ligar"}
    />
  );
}
