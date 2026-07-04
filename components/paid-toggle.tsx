"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Circle, Clock, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { payWithComprovante, toggleDocumentPaid } from "@/app/actions/documents";
import type { DocStatus } from "@/lib/types";

/** Botão de marcar/desmarcar boleto como pago (toggle). */
export function PaidToggle({
  docId,
  paid,
  status,
  isAdmin = false,
  labelPaid = "Pago",
  labelUnpaid = "Marcar pago",
  requireComprovante = false,
  hasComprovante = false,
  unpaidVariant = "default",
}: {
  docId: string;
  paid: boolean;
  /** Status completo da guia. Quando 'aguardando', o cliente vê o botão travado. */
  status?: DocStatus;
  /** True nas telas do contador: mostra o botão de confirmação em vez de travar. */
  isAdmin?: boolean;
  /** Rótulos personalizados (ex.: débito automático usa "Confirmar pagamento"). */
  labelPaid?: string;
  labelUnpaid?: string;
  /** Guia exige comprovante: para quitar é preciso anexá-lo (regra do contador). */
  requireComprovante?: boolean;
  /** Já existe comprovante anexado nesta guia. */
  hasComprovante?: boolean;
  /** Visual do botão quando ainda não pago. "outline" deixa menos chamativo
   *  (usado no dashboard do contador, onde marcar pago é ação secundária). */
  unpaidVariant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cliente com pagamento declarado (aguardando): botão travado — só o contador
  // resolve, pelos botões de confirmar/rejeitar (ver ConfirmPaymentButtons).
  if (status === "aguardando" && !isAdmin) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
        title="Você marcou como pago. Aguarde a confirmação do contador."
      >
        <Clock className="size-3 shrink-0" />
        Aguardando confirmação
      </span>
    );
  }

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
      <span className="inline-flex flex-col items-start gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={onFileChange}
        />
        <Button
          type="button"
          variant={unpaidVariant}
          size="sm"
          disabled={pending}
          title="Anexe o comprovante para marcar como pago"
          onClick={() => {
            setError(null);
            inputRef.current?.click();
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Circle />}
          {labelUnpaid}
        </Button>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
          <Paperclip className="size-3 shrink-0" />
          Comprovante obrigatório
        </span>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={paid ? "outline" : unpaidVariant}
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
