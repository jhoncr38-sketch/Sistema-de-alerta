import { CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import type { EarnRule } from "@/lib/rewards";

/**
 * Trilho horizontal com as boas ações que geram SJ Coins. Rolagem por gesto/scroll,
 * sem quebrar em várias linhas — mantém a home enxuta. As regras vêm do banco
 * (editáveis pelo contador); com fallback para o padrão do código.
 */
export function EarnRail({ rules }: { rules: EarnRule[] }) {
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RewardIcon name={rule.icon} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {rule.label}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {rule.description}
            </p>
          </div>
          <CoinAmount
            value={rule.coins}
            signed
            className="mt-auto text-sm text-amber-600 dark:text-amber-400"
          />
        </div>
      ))}
    </div>
  );
}
