import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import type { EarnRule } from "@/lib/rewards";

/**
 * Destino no portal onde o cliente realiza aquela ação. Ações sem destino óbvio
 * (acesso, vídeo, pesquisa) não recebem atalho.
 */
function earnHref(rule: EarnRule): string | null {
  if (rule.id === "doc-no-prazo") return "/portal/solicitacoes";
  if (rule.payCategoria === "parcelamento" || rule.id === "parcelamento-em-dia")
    return "/portal/parcelamentos";
  if (rule.payCategoria === "boleto" || rule.id === "honorarios-em-dia")
    return "/portal/boletos";
  return null;
}

/**
 * Trilho horizontal com as boas ações que geram SJ Coins. Rolagem por gesto/scroll,
 * sem quebrar em várias linhas. As regras vêm do banco (editáveis pelo contador),
 * com fallback para o padrão do código. O card em si não navega (evita clique sem
 * querer ao rolar); só o atalho "Ir →" leva à aba onde a ação acontece.
 */
export function EarnRail({ rules }: { rules: EarnRule[] }) {
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rules.map((rule) => {
        const href = earnHref(rule);
        return (
          <div
            key={rule.id}
            className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10"
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
            <div className="mt-auto flex items-center justify-between gap-1">
              <CoinAmount
                value={rule.coins}
                signed
                className="text-sm text-amber-600 dark:text-amber-400"
              />
              {href ? (
                <Link
                  href={href}
                  aria-label={`Ir para ${rule.label}`}
                  className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-xs font-medium text-primary transition-colors hover:underline"
                >
                  Ir
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
