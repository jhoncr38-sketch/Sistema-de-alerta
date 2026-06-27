"use client";

import { useTransition } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleDocumentPaid } from "@/app/actions/documents";

/** Botão de marcar/desmarcar boleto como pago (toggle). */
export function PaidToggle({
  docId,
  paid,
  labelPaid = "Pago",
  labelUnpaid = "Marcar pago",
}: {
  docId: string;
  paid: boolean;
  /** Rótulos personalizados (ex.: débito automático usa "Confirmar pagamento"). */
  labelPaid?: string;
  labelUnpaid?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={paid ? "outline" : "default"}
      size="sm"
      disabled={pending}
      title={paid ? "Clique para desmarcar" : "Marcar como pago"}
      onClick={() =>
        startTransition(async () => {
          await toggleDocumentPaid(docId, !paid);
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : paid ? (
        <Check />
      ) : (
        <Circle />
      )}
      {paid ? labelPaid : labelUnpaid}
    </Button>
  );
}
