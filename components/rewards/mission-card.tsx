import { ClipboardList } from "lucide-react";
import { CoinAmount } from "@/components/rewards/coin";
import { ProgressBar } from "@/components/rewards/parts";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { Card } from "@/components/ui/card";
import { missionDone, missionPct, type Mission } from "@/lib/rewards";

export function MissionCard({ mission }: { mission: Mission }) {
  const pct = missionPct(mission);
  const done = missionDone(mission);

  return (
    <Card className="gap-0 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {mission.tag ?? "Missão do mês"}
          </span>
        </div>
        <CoinAmount value={mission.coins} signed className="text-sm text-amber-600 dark:text-amber-400" />
      </div>

      <div className="flex items-start gap-4 px-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {mission.icon ? (
            <RewardIcon name={mission.icon} className="size-5" />
          ) : (
            <ClipboardList className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{mission.title}</p>
          {mission.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {mission.description}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <ProgressBar pct={pct} className="flex-1" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
              {mission.progress}/{mission.target}
              {mission.dueLabel ? ` · ${mission.dueLabel}` : ""}
            </span>
          </div>

          {done ? (
            <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Missão concluída — recompensa liberada!
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
