import { Flame } from "lucide-react";
import { ProgressBar } from "@/components/rewards/parts";
import { Card } from "@/components/ui/card";
import { streakMultiplier } from "@/lib/rewards";

/**
 * Sequência de dias consecutivos. O multiplicador cresce a cada 7 dias; a barra
 * mostra o quanto falta para o próximo degrau de bônus.
 */
export function StreakCard({ days }: { days: number }) {
  const mult = streakMultiplier(days);
  const intoWeek = days % 7;
  const toNext = 7 - intoWeek;
  const atCap = mult >= 1.5;

  return (
    <Card className="gap-3 shadow-sm">
      <div className="flex items-center gap-3 px-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 dark:bg-orange-950/50 dark:text-orange-400">
          <Flame className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold leading-none tabular-nums">
              {days}
            </span>
            <span className="text-sm text-muted-foreground">
              dias consecutivos
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bônus atual de{" "}
            <span className="font-semibold text-orange-500 dark:text-orange-400">
              {mult.toFixed(2).replace(".", ",")}×
            </span>{" "}
            em SJ Coins
          </p>
        </div>
      </div>
      <div className="px-4">
        <ProgressBar
          pct={atCap ? 100 : (intoWeek / 7) * 100}
          tone="gold"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {atCap
            ? "Bônus máximo alcançado — continue assim!"
            : `Faltam ${toNext} ${toNext === 1 ? "dia" : "dias"} para aumentar seu bônus.`}
        </p>
      </div>
    </Card>
  );
}
