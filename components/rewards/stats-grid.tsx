import { Gift, Sparkles, Target, TrendingUp } from "lucide-react";
import { Coin } from "@/components/rewards/coin";
import { levelForXp, type RewardsState } from "@/lib/rewards";
import { cn } from "@/lib/utils";

function StatTile({
  label,
  value,
  icon,
  accent = "primary",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "primary" | "gold";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 ring-1 ring-foreground/10">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
          accent === "gold"
            ? "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
            : "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight tabular-nums">
          {value}
        </div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Painel de indicadores do cliente — visão de relance no topo da aba. */
export function StatsGrid({
  coins,
  redeemed,
  state,
}: {
  coins: number;
  /** Prêmios resgatados ao vivo (reflete resgates feitos na sessão). */
  redeemed: number;
  state: RewardsState;
}) {
  const level = levelForXp(state.xp);
  const nf = new Intl.NumberFormat("pt-BR");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile
        label="SJ Coins"
        value={nf.format(coins)}
        icon={<Coin className="text-lg" />}
        accent="gold"
      />
      <StatTile
        label="XP total"
        value={nf.format(state.xp)}
        icon={<Sparkles />}
      />
      <StatTile label="Nível" value={level.name} icon={<TrendingUp />} />
      <StatTile
        label="Missões"
        value={nf.format(state.missionsCompleted)}
        icon={<Target />}
      />
      <StatTile label="Prêmios" value={nf.format(redeemed)} icon={<Gift />} />
      <StatTile
        label="Boas ações"
        value={nf.format(state.goodActions)}
        icon={<Sparkles />}
      />
    </div>
  );
}
