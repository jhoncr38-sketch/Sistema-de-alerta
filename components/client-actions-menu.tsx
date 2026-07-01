"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  CircleCheck,
  EllipsisVertical,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
}: {
  clientName: string;
  active: boolean;
  toggleActiveAction: () => Promise<void>;
  promoteAction: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
