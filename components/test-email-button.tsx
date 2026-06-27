"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  sendTestEmail,
  type TestEmailState,
} from "@/app/(admin)/painel/configuracoes/actions";

/** Botão que dispara um e-mail de teste para o próprio contador (valida o Resend). */
export function TestEmailButton({ to }: { to: string | null }) {
  const [state, action, pending] = useActionState<TestEmailState, FormData>(
    sendTestEmail,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(
        `E-mail de teste enviado para ${state.to}. Confira a caixa de entrada (e o spam).`,
      );
    } else if (state.skipped) {
      toast.warning(
        "RESEND_API_KEY não configurada — nada foi enviado (apenas registrado no log do servidor).",
      );
    } else if (state.error) {
      toast.error(`Falha no envio: ${state.error}`);
    }
  }, [state]);

  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar e-mail de teste
      </Button>
      {to ? (
        <p className="text-xs text-muted-foreground">
          Será enviado para <strong>{to}</strong> (seu e-mail de login).
        </p>
      ) : null}
    </form>
  );
}
