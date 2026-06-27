"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInstallmentPlan } from "@/app/(admin)/painel/parcelamentos/actions";
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

/**
 * Apaga um parcelamento inteiro (plano + parcelas + PDFs) e volta para a lista.
 * Diferente do ConfirmDeleteButton genérico, este navega após apagar — a página
 * de detalhe deixa de existir.
 */
export function DeletePlanButton({
  planId,
  nome,
  companyName,
}: {
  planId: string;
  nome: string;
  companyName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await deleteInstallmentPlan(planId);
        toast.success("Parcelamento apagado.");
        setOpen(false);
        router.push("/painel/parcelamentos");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao apagar.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Excluir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar parcelamento?</DialogTitle>
            <DialogDescription>
              O parcelamento <strong>{nome}</strong>
              {companyName ? ` de ${companyName}` : ""} será removido junto com
              todas as parcelas e seus PDFs. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Apagar parcelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
