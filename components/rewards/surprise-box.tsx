"use client";

import { useState } from "react";
import { Gift, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Coin } from "@/components/rewards/coin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prêmios possíveis da caixa surpresa (todos em SJ Coins, para creditar o saldo). */
const PRIZES = [
  { label: "Bônus relâmpago", coins: 100 },
  { label: "Ótima semana!", coins: 150 },
  { label: "Você mandou bem", coins: 200 },
  { label: "Prêmio raro", coins: 300 },
];

export function SurpriseBox({
  unlocked,
  onReveal,
}: {
  unlocked: boolean;
  /** Credita as moedas sorteadas no saldo do cliente. */
  onReveal: (coins: number) => void;
}) {
  const [prize, setPrize] = useState<(typeof PRIZES)[number] | null>(null);

  function open() {
    const picked = PRIZES[Math.floor(Math.random() * PRIZES.length)];
    setPrize(picked);
    onReveal(picked.coins);
    toast.success("Caixa surpresa aberta!", {
      description: `${picked.label} — +${picked.coins} SJ Coins creditadas.`,
    });
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl p-6 text-white",
        "bg-gradient-to-br from-[#1a1440] via-[#2a1e5c] to-[#1a1440] ring-1 ring-white/10",
      )}
    >
      <div
        className="pointer-events-none absolute -left-10 -top-10 size-52 rounded-full bg-amber-400/15 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <span
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-3xl",
            unlocked
              ? "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg"
              : "bg-white/10 text-white/50",
          )}
        >
          {prize ? (
            <Sparkles className="size-8 animate-in zoom-in duration-500" aria-hidden />
          ) : unlocked ? (
            <Gift className="size-8 animate-pulse" aria-hidden />
          ) : (
            <Lock className="size-7" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg font-semibold">Caixa surpresa</p>
          {prize ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/80 sm:justify-start">
              {prize.label} —{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                +{prize.coins} <Coin />
              </span>
            </p>
          ) : unlocked ? (
            <p className="mt-1 text-sm text-white/70">
              Você concluiu todas as missões do mês. Abra e receba um bônus
              aleatório!
            </p>
          ) : (
            <p className="mt-1 text-sm text-white/60">
              Conclua todas as missões do mês para desbloquear um bônus especial.
            </p>
          )}
        </div>

        <div className="shrink-0">
          <Button
            onClick={open}
            disabled={!unlocked || prize !== null}
            className="border border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25 disabled:opacity-60"
          >
            {prize ? "Aberta" : unlocked ? "Abrir caixa" : "Bloqueada"}
          </Button>
        </div>
      </div>
    </div>
  );
}
