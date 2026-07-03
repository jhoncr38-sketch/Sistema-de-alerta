"use client";

import { Crown } from "lucide-react";
import { AnimatedNumber, Coin } from "@/components/rewards/coin";
import { levelProgress } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Anel de progresso do XP, em dourado sobre fundo escuro. Coroa + % + rótulo do
 * próximo nível no centro. É o coração do card — o "quanto falta para subir".
 */
function XpRing({ pct, nextName }: { pct: number; nextName: string | null }) {
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        nextName ? `${pct}% rumo ao nível ${nextName}` : "Nível máximo atingido"
      }
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="sj-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          stroke="url(#sj-gold)"
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Crown className="mb-1 size-5 text-amber-400" aria-hidden />
        <span className="text-2xl font-semibold leading-none tabular-nums text-white">
          {pct}%
        </span>
        {nextName ? (
          <span className="mt-1 text-xs text-white/60">para {nextName}</span>
        ) : (
          <span className="mt-1 text-xs text-amber-400">nível máximo</span>
        )}
      </div>
    </div>
  );
}

export function LevelHero({
  name,
  coins,
  xp,
  onOpenHistory,
}: {
  name: string;
  coins: number;
  xp: number;
  onOpenHistory?: () => void;
}) {
  const { current, next, pct } = levelProgress(xp);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8",
        "bg-gradient-to-br from-[#0b1220] via-[#132038] to-[#0b1220]",
        "ring-1 ring-white/10",
      )}
    >
      {/* Brilho dourado sutil ao fundo */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-amber-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
        {/* Saudação + nível */}
        <div className="order-2 text-center sm:order-1 sm:text-left">
          <p className="text-sm text-white/60">Olá, {name}!</p>
          <p className="mt-3 text-xs text-white/50">Sua empresa está no nível</p>
          <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
            <Crown className="size-4 text-amber-400" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide text-amber-300">
              {current.name}
            </span>
          </div>
        </div>

        {/* Anel de XP */}
        <div className="order-1 sm:order-2">
          <XpRing pct={pct} nextName={next?.name ?? null} />
        </div>

        {/* Saldo de SJ Coins */}
        <div className="order-3 text-center sm:text-right">
          <p className="text-sm text-white/60">SJ Coins</p>
          <div className="mt-1 flex items-center justify-center gap-2 text-4xl font-semibold sm:justify-end">
            <Coin className="text-[0.5em]" />
            <AnimatedNumber value={coins} className="text-white" />
          </div>
          <p className="mt-0.5 text-xs text-white/50">Coins acumuladas</p>
          <button
            type="button"
            onClick={onOpenHistory}
            className="mt-3 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            Ver histórico
          </button>
        </div>
      </div>
    </section>
  );
}
