"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { setDocumentRequireProof } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botão (só do contador) que liga/desliga "exigir comprovante" numa guia. Ligado:
 * o cliente só consegue marcar como pago anexando o comprovante. Otimista no
 * rótulo via estado local; reverte se a action falhar.
 */
export function RequireProofToggle({
  docId,
  value,
}: {
  docId: string;
  value: boolean;
}) {
  const [on, setOn] = useState(value);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      try {
        await setDocumentRequireProof(docId, next);
        toast.success(
          next
            ? "Comprovante passou a ser obrigatório para esta guia."
            : "Comprovante deixou de ser obrigatório.",
        );
      } catch (e) {
        setOn(!next); // reverte
        toast.error(e instanceof Error ? e.message : "Falha ao atualizar.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={toggle}
      aria-pressed={on}
      title={
        on
          ? "Comprovante obrigatório para o cliente marcar como pago — clique para desativar"
          : "Exigir comprovante para o cliente marcar como pago"
      }
      className={cn(
        on
          ? "text-amber-600 hover:text-amber-700 dark:text-amber-400"
          : "text-muted-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : on ? (
        <ShieldCheck />
      ) : (
        <ShieldAlert />
      )}
      <span className="hidden lg:inline">{on ? "Exige" : "Exigir"}</span>
    </Button>
  );
}
