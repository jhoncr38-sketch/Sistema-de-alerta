import Link from "next/link";
import { CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import type { EarnRule } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Destino no portal onde o cliente realiza aquela ação — o card leva direto pra
 * lá ao ser clicado. Ações sem destino óbvio (acesso, vídeo, pesquisa) não linkam.
 */
function earnHref(rule: EarnRule): string | null {
  if (rule.id === "doc-no-prazo") return "/portal/solicitacoes";
  if (rule.payCategoria === "parcelamento" || rule.id === "parcelamento-em-dia")
    return "/portal/parcelamentos";
  if (rule.payCategoria === "boleto" || rule.id === "honorarios-em-dia")
    return "/portal/boletos";
  return null;
}

const CARD =
  "flex w-36 shrink-0 snap-start flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:shadow-md";

/**
 * Trilho horizontal com as boas ações que geram SJ Coins. Rolagem por gesto/scroll,
 * sem quebrar em várias linhas — mantém a home enxuta. As regras vêm do banco
 * (editáveis pelo contador); com fallback para o padrão do código. Cada card leva
 * o cliente à aba onde ele faz aquela ação.
 */
export function EarnRail({ rules }: { rules: EarnRule[] }) {
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rules.map((rule) => {
        const href = earnHref(rule);
        const inner = (
          <>
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
          </>
        );

        return href ? (
          <Link
            key={rule.id}
            href={href}
            className={cn(CARD, "cursor-pointer hover:ring-primary/40")}
          >
            {inner}
          </Link>
        ) : (
          <div key={rule.id} className={CARD}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
