"use client";

import { useState, useTransition } from "react";
import { EllipsisVertical, Loader2, ShieldCheck } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu "⋯" de ações secundárias de um cliente ativo. Hoje contém apenas
 * "Tornar contador" — uma ação rara e poderosa, por isso fica escondida atrás
 * do menu (não solta na linha) para evitar clique acidental. Ao clicar, abre
 * um modal de confirmação antes de promover de fato.
 */
export function ClientActionsMenu({
  clientName,
  promoteAction,
}: {
  clientName: string;
  promoteAction: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
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
            onClick={() => setTimeout(() => setConfirmOpen(true), 10)}
          >
            <ShieldCheck />
            Tornar contador
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
