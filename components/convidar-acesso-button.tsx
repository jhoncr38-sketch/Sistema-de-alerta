"use client";

import { useTransition } from "react";
import { BellRing, Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConvidarResult } from "@/app/(admin)/painel/clientes/actions";

/**
 * Botão "Convidar": manda um convite de acesso com LOGIN SEM SENHA (magic link).
 * Aparece para clientes sumidos / que nunca entraram. Duas opções:
 *   • E-mail   — dispara o convite dourado da SJ (toast com o resultado).
 *   • WhatsApp — abre o wa.me com a mensagem + link prontos para o contador enviar.
 * A janela do WhatsApp é reservada no clique (síncrona) e só então recebe a URL,
 * evitando o bloqueador de pop-ups (que barra window.open após um await).
 */
export function ConvidarAcessoButton({
  action,
  hasEmail,
  hasPhone,
}: {
  action: (canal: "email" | "whatsapp") => Promise<ConvidarResult>;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function convidarEmail() {
    startTransition(async () => {
      try {
        const r = await action("email");
        if (r.ok) {
          toast.success(`Convite enviado para ${r.to}.`);
        } else if (r.skipped) {
          toast.warning(
            "E-mail não configurado — nada foi enviado (apenas registrado no log).",
          );
        } else {
          toast.error(r.error ?? "Não foi possível enviar o convite.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao convidar.");
      }
    });
  }

  function convidarWhatsapp() {
    // Reserva a aba já no gesto do clique (senão o pop-up é bloqueado após o await).
    const win = window.open("about:blank", "_blank");
    startTransition(async () => {
      try {
        const r = await action("whatsapp");
        if (r.waUrl) {
          if (win) win.location.href = r.waUrl;
          else window.location.href = r.waUrl; // pop-up bloqueado: navega na aba
          toast.success("Abrindo o WhatsApp com a mensagem pronta…");
        } else {
          win?.close();
          toast.error(r.error ?? "Não foi possível montar o convite do WhatsApp.");
        }
      } catch (e) {
        win?.close();
        toast.error(e instanceof Error ? e.message : "Falha ao convidar.");
      }
    });
  }

  if (!hasEmail && !hasPhone) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            title="Enviar um convite de acesso ao portal (login sem senha)"
          />
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <BellRing />}
        Convidar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {hasEmail ? (
          <DropdownMenuItem onClick={convidarEmail}>
            <Mail />
            Convidar por e-mail
          </DropdownMenuItem>
        ) : null}
        {hasPhone ? (
          <DropdownMenuItem onClick={convidarWhatsapp}>
            <MessageCircle />
            Convidar por WhatsApp
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
