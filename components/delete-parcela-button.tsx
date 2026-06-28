"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteParcela } from "@/app/(admin)/painel/parcelamentos/actions";
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
 * Apaga UMA parcela de um parcelamento (registro + PDF + comprovante). Usado na
 * tabela de parcelas, só no painel do contador. Atualiza a página ao concluir —
 * o parcelamento continua existindo, apenas sem aquela parcela.
 */
export function DeleteParcelaButton({
  docId,
  parcelaNum,
  total,
}: {
  docId: string;
  parcelaNum: number | null;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rotulo = parcelaNum ? `parcela ${parcelaNum}/${total}` : "esta parcela";

  function handleConfirm() {
    startTransition(async () => {
      try {
        await deleteParcela(docId);
        toast.success("Parcela apagada.");
        setOpen(false);
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
            <DialogTitle>Apagar parcela?</DialogTitle>
            <DialogDescription>
              A <strong>{rotulo}</strong> será removida do parcelamento, junto
              com o PDF da guia e o comprovante (se houver). Esta ação não pode
              ser desfeita. O parcelamento e as demais parcelas continuam.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Apagar parcela
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
