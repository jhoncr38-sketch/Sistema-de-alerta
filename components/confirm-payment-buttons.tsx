"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDocumentPayment } from "@/app/actions/documents";

/**
 * Botões do CONTADOR para resolver um pagamento declarado pelo cliente
 * ('aguardando'): confirmar (-> pago) ou rejeitar (-> volta a aberto).
 * Aparece só nas telas do contador, no lugar do "marcar pago".
 */
export function ConfirmPaymentButtons({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(confirm: boolean) {
    startTransition(async () => {
      try {
        await confirmDocumentPayment(docId, confirm);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao atualizar.");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        title="Confirmar o pagamento"
        onClick={() => run(true)}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        Confirmar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={pending}
        title="Rejeitar — voltar para em aberto"
        onClick={() => run(false)}
      >
        <X />
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
