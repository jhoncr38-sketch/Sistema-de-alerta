"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Circle, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { payWithComprovante, toggleDocumentPaid } from "@/app/actions/documents";

/** Botão de marcar/desmarcar boleto como pago (toggle). */
export function PaidToggle({
  docId,
  paid,
  labelPaid = "Pago",
  labelUnpaid = "Marcar pago",
  requireComprovante = false,
  hasComprovante = false,
}: {
  docId: string;
  paid: boolean;
  /** Rótulos personalizados (ex.: débito automático usa "Confirmar pagamento"). */
  labelPaid?: string;
  labelUnpaid?: string;
  /** Guia exige comprovante: para quitar é preciso anexá-lo (regra do contador). */
  requireComprovante?: boolean;
  /** Já existe comprovante anexado nesta guia. */
  hasComprovante?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quitar exige anexar o comprovante (e ainda não há um). O botão vira um fluxo
  // único: escolher o arquivo, que é anexado e já marca como pago.
  const precisaAnexar = !paid && requireComprovante && !hasComprovante;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        await payWithComprovante(docId, fd);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao marcar pago.");
      }
    });
  }

  if (precisaAnexar) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={pending}
          title="Anexe o comprovante para marcar como pago"
          onClick={() => {
            setError(null);
            inputRef.current?.click();
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {labelUnpaid}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={paid ? "outline" : "default"}
        size="sm"
        disabled={pending}
        title={paid ? "Clique para desmarcar" : "Marcar como pago"}
        onClick={() =>
          startTransition(async () => {
            try {
              await toggleDocumentPaid(docId, !paid);
              setError(null);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Falha ao atualizar.",
              );
            }
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
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
