import { CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { formatDate } from "@/lib/format";
import type { LedgerEntry } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/** Extrato de moedas e XP — leitura no estilo de fatura de banco. */
export function HistoryList({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
        Suas ações aparecem aqui conforme você acumula SJ Coins.
      </div>
    );
  }

  return (
    <div className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      {entries.map((e) => {
        const isRedeem = e.coins < 0;
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
                isRedeem
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
              )}
            >
              <RewardIcon name={e.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.label}</p>
              <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
            </div>
            <div className="shrink-0 text-right">
              <CoinAmount
                value={e.coins}
                signed
                className={cn(
                  "text-sm",
                  isRedeem
                    ? "text-muted-foreground"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              />
              {e.xp > 0 ? (
                <p className="text-xs text-muted-foreground">+{e.xp} XP</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
