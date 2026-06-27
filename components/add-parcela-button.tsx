"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addParcela } from "@/app/(admin)/painel/parcelamentos/actions";
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
 * Adiciona a próxima guia (parcela do mês) a um parcelamento existente.
 * Sugere o próximo número e atualiza a página ao concluir.
 */
export function AddParcelaButton({
  planId,
  nextNum,
  total,
}: {
  planId: string;
  nextNum: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addParcela({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Parcela adicionada.");
      setError(undefined);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Adicionar parcela
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar parcela</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="plan_id" value={planId} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="num">Nº da parcela (de {total})</Label>
                <Input
                  id="num"
                  name="num"
                  type="number"
                  min={1}
                  max={total}
                  defaultValue={nextNum}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Valor (R$)</Label>
                <CurrencyInput id="amount" name="amount" placeholder="1.240,00" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due">Vencimento</Label>
              <Input id="due" name="due" type="date" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file">PDF da guia</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
