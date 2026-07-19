"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  CircleCheck,
  EllipsisVertical,
  Loader2,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConvidarResult } from "@/app/(admin)/painel/clientes/actions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu "⋯" de ações secundárias de um cliente ativo: desativar/reativar o
 * acesso ao portal e "Tornar contador". São ações mais raras ou perigosas, por
 * isso ficam escondidas atrás do menu (não soltas na linha) para evitar clique
 * acidental. Cada uma abre um modal de confirmação antes de executar.
 */
export function ClientActionsMenu({
  clientName,
  active,
  toggleActiveAction,
  promoteAction,
  convidarAction,
  hasEmail = false,
  hasPhone = false,
}: {
  clientName: string;
  active: boolean;
  toggleActiveAction: () => Promise<void>;
  promoteAction: () => Promise<void>;
  /** Convida o cliente a acessar o portal (login sem senha), por canal. */
  convidarAction?: (canal: "email" | "whatsapp") => Promise<ConvidarResult>;
  /** "Convidar por e-mail" só aparece quando o cliente tem e-mail. */
  hasEmail?: boolean;
  /** "Convidar por WhatsApp" só aparece quando a empresa tem telefone. */
  hasPhone?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConvidar(canal: "email" | "whatsapp") {
    if (!convidarAction) return;
    // Reserva a aba no gesto do clique (WhatsApp) para não ser bloqueada após o await.
    const win = canal === "whatsapp" ? window.open("about:blank", "_blank") : null;
    startTransition(async () => {
      try {
        const r = await convidarAction(canal);
        if (canal === "whatsapp") {
          if (r.waUrl) {
            if (win) win.location.href = r.waUrl;
            else window.location.href = r.waUrl;
            toast.success("Abrindo o WhatsApp com a mensagem pronta…");
          } else {
            win?.close();
            toast.error(r.error ?? "Não foi possível montar o convite do WhatsApp.");
          }
          return;
        }
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
        win?.close();
        toast.error(e instanceof Error ? e.message : "Falha ao convidar.");
      }
    });
  }

  function handlePromote() {
    startTransition(async () => {
      try {
        await promoteAction();
        toast.success("Cliente agora tem acesso de contador.");
        setConfirmOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na ação.");
      }
    });
  }

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleActiveAction();
        toast.success(active ? "Acesso desativado." : "Acesso reativado.");
        setToggleOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na ação.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Mais ações"
              title="Mais ações"
            />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {convidarAction && hasEmail ? (
            <DropdownMenuItem
              onClick={() => handleConvidar("email")}
              disabled={pending}
            >
              <Mail />
              Convidar por e-mail
            </DropdownMenuItem>
          ) : null}
          {convidarAction && hasPhone ? (
            <DropdownMenuItem
              onClick={() => handleConvidar("whatsapp")}
              disabled={pending}
            >
              <MessageCircle />
              Convidar por WhatsApp
            </DropdownMenuItem>
          ) : null}
          {convidarAction && (hasEmail || hasPhone) ? (
            <DropdownMenuSeparator />
          ) : null}
          <DropdownMenuItem
            // Abre o modal depois que o menu fecha, evitando conflito de foco.
            onClick={() => setTimeout(() => setToggleOpen(true), 10)}
            variant={active ? "destructive" : "default"}
          >
            {active ? <Ban /> : <CircleCheck />}
            {active ? "Desativar acesso" : "Reativar acesso"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setTimeout(() => setConfirmOpen(true), 10)}
          >
            <ShieldCheck />
            Tornar contador
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {active ? "Desativar acesso?" : "Reativar acesso?"}
            </DialogTitle>
            <DialogDescription>
              {active ? (
                <>
                  <strong>{clientName}</strong> não vai mais conseguir entrar no
                  portal enquanto estiver desativado. O cadastro, as empresas
                  vinculadas e os documentos são mantidos — é só reativar para
                  liberar de novo.
                </>
              ) : (
                <>
                  <strong>{clientName}</strong> voltará a acessar o portal
                  normalmente, com as mesmas empresas e documentos de antes.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant={active ? "destructive" : "default"}
              onClick={handleToggle}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" />
              ) : active ? (
                <Ban />
              ) : (
                <CircleCheck />
              )}
              {active ? "Desativar acesso" : "Reativar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar acesso de contador?</DialogTitle>
            <DialogDescription>
              <strong>{clientName}</strong> passará a ver o{" "}
              <strong>painel completo do contador</strong>, com todos os
              clientes, empresas e documentos do escritório. Use apenas para
              sócios ou assistentes de confiança. Você pode remover o acesso
              depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="button" onClick={handlePromote} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Tornar contador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
