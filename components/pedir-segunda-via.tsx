"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { requestBoletoReissue } from "@/app/actions/documents";

/**
 * Link discreto "Pedir 2ª via" — aparece SÓ em boleto vencido no portal do
 * cliente. Um clique registra o pedido e avisa o contador; não polui a tela
 * (some quando a guia está em dia/paga). Após pedir, vira "2ª via solicitada".
 */
export function PedirSegundaVia({
  docId,
  jaSolicitado = false,
}: {
  docId: string;
  /** Já existe um pedido pendente para este boleto (some o link, mostra o selo). */
  jaSolicitado?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feito, setFeito] = useState(jaSolicitado);
  const [erro, setErro] = useState<string | null>(null);

  if (feito) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" />
        2ª via solicitada
      </span>
    );
  }

  function pedir() {
    setErro(null);
    startTransition(async () => {
      try {
        await requestBoletoReissue(docId);
        setFeito(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível pedir agora.");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={pedir}
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        Pedir 2ª via
      </button>
      {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
    </span>
  );
}
