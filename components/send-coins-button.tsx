"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  sendRewardCoins,
  withdrawRewardCoins,
} from "@/app/(admin)/painel/rewards/actions";
import { Coin } from "@/components/rewards/coin";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CompanyOption {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}

type Mode = "enviar" | "retirar";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function SendCoinsButton({
  companies,
}: {
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("enviar");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isWithdraw = mode === "retirar";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = isWithdraw
        ? await withdrawRewardCoins({}, formData)
        : await sendRewardCoins({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(isWithdraw ? "SJ Coins retiradas." : "SJ Coins creditadas.");
      form.reset();
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Coin className="text-sm" />
        Ajustar SJ Coins
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isWithdraw ? "Retirar SJ Coins" : "Enviar SJ Coins"}
            </DialogTitle>
            <DialogDescription>
              {isWithdraw
                ? "Retire moedas e/ou XP de uma empresa — correção ou estorno manual. Nunca deixa o saldo negativo."
                : "Credite moedas e/ou XP a uma empresa — bônus, campanha ou correção. Entra no extrato do cliente na hora."}
            </DialogDescription>
          </DialogHeader>

          {/* Alterna entre creditar e retirar */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["enviar", "retirar"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "enviar" ? "Enviar" : "Retirar"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="company_id">Empresa *</Label>
              <select
                id="company_id"
                name="company_id"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>
                  Selecione a empresa
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="coins">SJ Coins</Label>
                <Input
                  id="coins"
                  name="coins"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex.: 500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="xp">XP (opcional)</Label>
                <Input
                  id="xp"
                  name="xp"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex.: 500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Motivo</Label>
              <Input
                id="reason"
                name="reason"
                placeholder={
                  isWithdraw
                    ? "Ex.: correção, bônus lançado por engano..."
                    : "Ex.: Empresa Nota 10, campanha de indicação..."
                }
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button
                type="submit"
                disabled={pending}
                variant={isWithdraw ? "destructive" : "default"}
              >
                {pending
                  ? isWithdraw
                    ? "Retirando..."
                    : "Enviando..."
                  : isWithdraw
                    ? "Retirar SJ Coins"
                    : "Enviar SJ Coins"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
