"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Interruptor } from "@/components/interruptor";

/**
 * Interruptor por empresa do SJ Rewards, usado na tabela de Empresas do painel.
 * Clique único, reversível: liga/desliga o clube daquela empresa. Não apaga
 * nada — só controla o que o cliente vê e o crédito automático de moedas.
 */
export function CompanyRewardsToggle({
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
            ? `SJ Rewards ligado para ${companyName}.`
            : `SJ Rewards desligado para ${companyName}.`,
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
      rotulo={`SJ Rewards — ${companyName}`}
      title={enabled ? "Ligado — clique para desligar" : "Desligado — clique para ligar"}
    />
  );
}
