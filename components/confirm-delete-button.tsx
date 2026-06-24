"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
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

/**
 * Botão de apagar com confirmação em modal. Recebe um Server Action já
 * vinculado ao alvo (ex.: deleteDocument.bind(null, id)). Mostra estado de
 * carregamento e feedback via toast. Usado só nas telas do contador.
 */
export function ConfirmDeleteButton({
  action,
  title,
  description,
  confirmLabel = "Apagar",
  successMessage = "Apagado com sucesso.",
  triggerLabel,
}: {
  action: () => Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  successMessage?: string;
  /** Se informado, o gatilho mostra texto ao lado do ícone (senão, só ícone). */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
        setOpen(false);
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
        size={triggerLabel ? "sm" : "icon-sm"}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={triggerLabel ? undefined : title}
        title={title}
      >
        <Trash2 />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
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
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
