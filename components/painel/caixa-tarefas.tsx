import Link from "next/link";
import { Eye, Zap } from "lucide-react";
import { ConfirmPaymentButtons } from "@/components/confirm-payment-buttons";
import { AnexarSegundaVia } from "@/components/painel/anexar-segunda-via";
import { MaisAcoesSegundaVia } from "@/components/painel/mais-acoes-segunda-via";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Tarefa {
  /** Chave única da linha. */
  chave: string;
  tipo: "2via" | "confirmar";
  /** 2ª via: id do pedido; confirmar: id do documento. */
  id: string;
  docId: string;
  companyId: string;
  cliente: string;
  /** "DARF IRPJ 3º tri · pedida 01/10". */
  meta: string;
  valor: number | null;
  /** Prazo da tarefa (YYYY-MM-DD). */
  prazo: string;
  /** Link para ver o comprovante (confirmação). */
  comprovanteUrl: string | null;
}

function Prazo({ prazo, hoje }: { prazo: string; hoje: string }) {
  const [, m, d] = prazo.split("-");
  const atrasada = prazo < hoje;
  const ehHoje = prazo === hoje;
  return (
    <span className="flex items-center gap-1.5 text-[13px]">
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          atrasada ? "bg-red-600" : ehHoje ? "bg-amber-500" : "bg-neutral-400",
        )}
      />
      <span
        className={cn(
          atrasada
            ? "text-red-700 dark:text-red-400"
            : ehHoje
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {atrasada ? "atrasada" : ehHoje ? "hoje" : `até ${d}/${m}`}
      </span>
    </span>
  );
}

/**
 * Caixa "Para você fazer" (topo da tela Clientes): pedidos de 2ª via e
 * pagamentos a confirmar, com a ação ali mesmo. Só aparece quando há tarefa.
 */
export function CaixaTarefas({ tarefas, hoje }: { tarefas: Tarefa[]; hoje: string }) {
  const colunas = "md:grid-cols-[96px_minmax(0,1fr)_96px_92px_236px]";
  return (
    <section className="overflow-hidden rounded-[10px] border bg-card">
      <div className="flex flex-wrap items-baseline gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold">Para você fazer</h2>
        <span className="text-xs text-muted-foreground">
          {tarefas.length} {tarefas.length === 1 ? "tarefa" : "tarefas"} · por prazo e valor
        </span>
      </div>

      <div
        className={cn(
          "hidden h-[30px] items-center gap-3 border-t bg-neutral-50 px-4 text-xs text-neutral-400 md:grid dark:bg-muted/40",
          colunas,
        )}
      >
        <span>Tarefa</span>
        <span>Cliente</span>
        <span className="text-right">Valor</span>
        <span>Prazo</span>
        <span />
      </div>
      {tarefas.map((t) => (
        <div
          key={t.chave}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5 md:grid md:h-[54px] md:gap-3 md:py-0",
            colunas,
          )}
        >
          <span className="order-3 md:order-none">
            <span
              className={cn(
                "inline-flex h-[22px] items-center rounded-md px-2 text-xs font-medium",
                t.tipo === "2via"
                  ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
              )}
            >
              {t.tipo === "2via" ? "2ª via" : "Confirmar"}
            </span>
          </span>
          <span className="order-1 min-w-0 flex-1 basis-[55%] md:order-none">
            <Link
              href={`/painel/clientes?empresa=${t.companyId}`}
              className="block truncate text-sm font-semibold hover:underline"
            >
              {t.cliente}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">{t.meta}</span>
          </span>
          <span className="order-2 text-sm font-semibold tabular-nums md:order-none md:text-right">
            {t.valor != null ? formatCurrency(t.valor) : "—"}
          </span>
          <span className="order-4 md:order-none">
            <Prazo prazo={t.prazo} hoje={hoje} />
          </span>
          <span className="order-5 ml-auto flex items-center gap-1.5 md:ml-0 md:justify-end">
            {t.tipo === "confirmar" ? (
              <>
                {t.comprovanteUrl ? (
                  <a
                    href={t.comprovanteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver o comprovante"
                    aria-label="Ver o comprovante"
                    className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Eye className="size-4" />
                  </a>
                ) : null}
                <ConfirmPaymentButtons docId={t.docId} variante="tarefa" />
              </>
            ) : (
              <>
                <Link
                  href={`/painel/enviar?aba=receita&empresa=${t.companyId}`}
                  title="Emitir a 2ª via direto na Receita"
                  className="inline-flex h-7 items-center gap-1 rounded-[7px] border px-2.5 text-[13px] font-medium hover:bg-muted"
                >
                  <Zap className="size-3.5" />
                  Serpro
                </Link>
                <AnexarSegundaVia requestId={t.id} titulo={`${t.cliente} · ${t.meta}`} />
                <MaisAcoesSegundaVia requestId={t.id} titulo={`${t.cliente} · ${t.meta}`} />
              </>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}
