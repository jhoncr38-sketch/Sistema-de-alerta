"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Coin, CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEVELS, meetsLevel, type Reward } from "@/lib/rewards";
import { cn } from "@/lib/utils";

function levelName(id: string): string {
  return LEVELS.find((l) => l.id === id)?.name ?? id;
}

export function RewardStore({
  coins,
  xp,
  rewards,
  onRedeem,
}: {
  coins: number;
  xp: number;
  /** Catálogo a exibir (vem do banco; editável pelo contador). */
  rewards: Reward[];
  /** Executa o resgate (baixa saldo, registra no extrato). */
  onRedeem: (reward: Reward) => void;
}) {
  const [pending, setPending] = useState<Reward | null>(null);

  function confirm() {
    if (pending) onRedeem(pending);
    setPending(null);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {rewards.map((reward) => {
          const affordable = coins >= reward.cost;
          const levelOk =
            !reward.requiresLevel || meetsLevel(xp, reward.requiresLevel);
          const locked = !levelOk;
          const disabled = !affordable || locked;
          const missing = reward.cost - coins;

          return (
            <div
              key={reward.id}
              className="flex flex-col rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-2xl",
                    locked
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
                  )}
                >
                  {locked ? (
                    <Lock className="size-5" aria-hidden />
                  ) : (
                    <RewardIcon name={reward.icon} />
                  )}
                </span>
                <CoinAmount
                  value={reward.cost}
                  className="text-sm text-foreground"
                />
              </div>

              <p className="mt-3 text-sm font-medium leading-snug">
                {reward.name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {reward.description}
              </p>

              <div className="mt-3 flex-1" />

              {locked ? (
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Exclusivo do nível {levelName(reward.requiresLevel!)}
                </p>
              ) : !affordable ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  Faltam {new Intl.NumberFormat("pt-BR").format(missing)} SJ Coins
                </p>
              ) : null}

              <Button
                size="sm"
                variant={disabled ? "outline" : "default"}
                disabled={disabled}
                onClick={() => setPending(reward)}
                className="w-full"
              >
                {locked ? "Bloqueado" : "Resgatar"}
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar resgate</DialogTitle>
            <DialogDescription>
              {pending ? (
                <>
                  Trocar <strong>{pending.cost} SJ Coins</strong> por{" "}
                  <strong>{pending.name}</strong>? Nossa equipe entra em contato
                  para combinar a entrega.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Seu saldo após o resgate</span>
            <span className="inline-flex items-center gap-1 font-semibold">
              {new Intl.NumberFormat("pt-BR").format(
                Math.max(0, coins - (pending?.cost ?? 0)),
              )}
              <Coin />
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button onClick={confirm}>Confirmar resgate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
