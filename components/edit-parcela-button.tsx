"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { editParcela } from "@/app/(admin)/painel/parcelamentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/masked-inputs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Edita o valor e/ou o vencimento de uma parcela já lançada (débito automático).
 * Pré-preenche os campos atuais e, se houver parcelas em aberto à frente, oferece
 * replicar o novo valor para elas. Atualiza a página ao concluir.
 */
export function EditParcelaButton({
  docId,
  parcelaNum,
  total,
  amount,
  dueDate,
  followingOpenCount,
}: {
  docId: string;
  parcelaNum: number | null;
  total: number;
  amount: number | null;
  dueDate: string | null;
  /** Quantas parcelas seguintes ainda estão em aberto (habilita "aplicar às próximas"). */
  followingOpenCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rotulo = parcelaNum ? `${parcelaNum}/${total}` : "parcela";
  // CurrencyInput trata o defaultValue como centavos (ex.: 81291 -> "812,91").
  const amountCents = amount != null ? String(Math.round(amount * 100)) : "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await editParcela({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Parcela atualizada.");
      setError(undefined);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil />
        Editar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar parcela {rotulo}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="doc_id" value={docId} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`amount-${docId}`}>Valor (R$)</Label>
                <CurrencyInput
                  id={`amount-${docId}`}
                  name="amount"
                  defaultValue={amountCents}
                  placeholder="1.240,00"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`due-${docId}`}>Vencimento</Label>
                <Input
                  id={`due-${docId}`}
                  name="due"
                  type="date"
                  defaultValue={dueDate ?? ""}
                  required
                />
              </div>
            </div>

            {followingOpenCount > 0 ? (
              <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
                <input
                  type="checkbox"
                  name="apply_forward"
                  value="1"
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="text-sm">
                  Aplicar este valor às próximas parcelas em aberto
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    O novo valor é replicado para as {followingOpenCount}{" "}
                    parcela(s) seguinte(s) ainda não paga(s). O vencimento muda só
                    nesta parcela.
                  </span>
                </span>
              </label>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Pencil />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
