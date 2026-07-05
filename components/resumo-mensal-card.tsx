import { Sparkles } from "lucide-react";

/**
 * Cartão do resumo mensal no dashboard do cliente. Apenas EXIBE o texto já
 * gerado pelo cron (lido de monthly_summaries) — não chama a IA aqui, então não
 * pesa o carregamento e aparece até offline. Se não houver resumo, não renderiza
 * nada (o dashboard segue igual).
 */
export function ResumoMensalCard({
  texto,
  competenciaLabel,
}: {
  texto: string | null;
  competenciaLabel: string;
}) {
  if (!texto) return null;

  return (
    <section className="rounded-xl border bg-gradient-to-br from-amber-50/70 to-transparent p-4 dark:from-amber-950/20">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            Resumo de {competenciaLabel}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {texto}
          </p>
        </div>
      </div>
    </section>
  );
}
