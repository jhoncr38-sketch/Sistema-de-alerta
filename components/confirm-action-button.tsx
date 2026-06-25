"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
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

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive";

/**
 * Botão de ação com confirmação em modal. Igual ao ConfirmDeleteButton, mas
 * com ícone e variantes configuráveis — serve para ações que não são "apagar"
 * (ex.: promover a contador / remover acesso). Recebe um Server Action já
 * vinculado ao alvo. Usado só nas telas do contador.
 */
export function ConfirmActionButton({
  action,
  icon: Icon,
  triggerLabel,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel = "Confirmar",
  confirmVariant = "default",
  successMessage = "Feito.",
}: {
  action: () => Promise<void>;
  icon: LucideIcon;
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  successMessage?: string;
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
        toast.error(e instanceof Error ? e.message : "Falha na ação.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        onClick={() => setOpen(true)}
        title={title}
      >
        <Icon />
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
              variant={confirmVariant}
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Icon />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
