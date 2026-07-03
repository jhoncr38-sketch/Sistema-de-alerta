import { RewardIcon } from "@/components/rewards/reward-icon";
import { Card } from "@/components/ui/card";
import type { ProgressStat } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Evolução do cliente contra o próprio histórico — nunca contra outros clientes.
 * O objetivo é reconhecer progresso, não criar competição.
 */
export function PersonalRanking({ stats }: { stats: ProgressStat[] }) {
  return (
    <Card className="gap-4 shadow-sm">
      <div className="px-4">
        <p className="text-xs text-muted-foreground">
          Comparado apenas com você mesmo — sua evolução ao longo do tempo.
        </p>
      </div>
      <div className="grid gap-3 px-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl bg-muted/40 p-4 ring-1 ring-foreground/5"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
                  "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
                )}
              >
                <RewardIcon name={s.icon} />
              </span>
              <span className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {s.value}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">{s.label}</p>
            {s.detail ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
