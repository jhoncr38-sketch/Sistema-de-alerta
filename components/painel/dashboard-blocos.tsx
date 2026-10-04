import Link from "next/link";
import { Check, ChevronRight, Eye, ListFilter, X, Zap } from "lucide-react";
import { ConfirmPaymentButtons } from "@/components/confirm-payment-buttons";
import { AnexarSegundaVia } from "@/components/painel/anexar-segunda-via";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Faixa de números = filtros                                          */
/* ------------------------------------------------------------------ */

export interface NumeroFiltro {
  key: string;
  rotulo: string;
  /** Classe do ponto colorido. */
  ponto: string;
  numero: number;
  valor?: string;
  /** Link que liga/desliga este filtro. */
  href: string;
}

export function FiltroNumeros({ itens, ativo }: { itens: NumeroFiltro[]; ativo: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {itens.map((n) => {
        const on = ativo === n.key;
        return (
          <Link
            key={n.key}
            href={n.href}
            scroll={false}
            aria-pressed={on}
            className={cn(
              "relative rounded-[10px] border bg-card px-4 py-3 transition-colors hover:border-foreground/30",
              on && "border-foreground ring-1 ring-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", n.ponto)} />
              {n.rotulo}
            </span>
            <span className="mt-0.5 flex items-baseline gap-2">
              <span className="text-[22px] font-semibold tabular-nums">{n.numero}</span>
              {n.valor ? (
                <span className="truncate text-[13px] text-muted-foreground tabular-nums">{n.valor}</span>
              ) : null}
            </span>
            {on ? (
              <X className="absolute top-2.5 right-2.5 size-3.5" />
            ) : (
              <ListFilter className="absolute top-2.5 right-2.5 size-3.5 text-neutral-300 dark:text-neutral-600" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Caixa "Para você fazer"                                              */
/* ------------------------------------------------------------------ */

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

export function CaixaTarefas({
  tarefas,
  hoje,
  filtro,
  foraDoFiltro,
  limparHref,
}: {
  tarefas: Tarefa[];
  hoje: string;
  /** Filtro ativo (rótulo + ponto) ou null. */
  filtro: { rotulo: string; ponto: string } | null;
  /** Quantas tarefas ficaram de fora do filtro. */
  foraDoFiltro: number;
  limparHref: string;
}) {
  const colunas = "md:grid-cols-[96px_minmax(0,1fr)_96px_92px_204px]";
  return (
    <section className="overflow-hidden rounded-[10px] border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold">Para você fazer</h2>
        {filtro ? (
          <>
            <Link
              href={limparHref}
              scroll={false}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background"
            >
              <span className={cn("size-1.5 rounded-full", filtro.ponto)} />
              {filtro.rotulo}
              <X className="size-3" />
            </Link>
            <span className="text-xs text-muted-foreground">
              {tarefas.length} de {tarefas.length + foraDoFiltro} · por prazo e valor
            </span>
          </>
        ) : tarefas.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {tarefas.length} {tarefas.length === 1 ? "tarefa" : "tarefas"} · por prazo e valor
          </span>
        ) : null}
      </div>

      {tarefas.length === 0 ? (
        <div className="flex items-center gap-4 border-t px-5 py-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Check className="size-5" />
          </span>
          <div>
            <p className="text-base font-semibold">Tudo em dia</p>
            <p className="text-[13px] text-muted-foreground">
              Nenhum pagamento para confirmar e nenhuma 2ª via pendente
              {filtro ? " neste filtro" : ""}. O que vem pela frente está logo abaixo.
            </p>
          </div>
        </div>
      ) : (
        <>
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
                "flex flex-col gap-2 border-t px-4 py-3 md:grid md:h-[54px] md:items-center md:gap-3 md:py-0",
                colunas,
              )}
            >
              <span>
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
              <span className="min-w-0">
                <Link
                  href={`/painel/clientes?empresa=${t.companyId}`}
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {t.cliente}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">{t.meta}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums md:text-right">
                {t.valor != null ? formatCurrency(t.valor) : "—"}
              </span>
              <Prazo prazo={t.prazo} hoje={hoje} />
              <span className="flex items-center gap-1.5 md:justify-end">
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
                  </>
                )}
              </span>
            </div>
          ))}
        </>
      )}

      {filtro && foraDoFiltro > 0 ? (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          {foraDoFiltro} {foraDoFiltro === 1 ? "tarefa fora" : "tarefas fora"} do filtro ·{" "}
          <Link href={limparHref} scroll={false} className="font-medium text-primary hover:underline">
            Mostrar todas
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Clientes com atenção                                                 */
/* ------------------------------------------------------------------ */

export interface ClienteAtencao {
  id: string;
  nome: string;
  /** Situação principal (ponto + texto). */
  situacao: string;
  tom: "red" | "amber" | "orange" | "muted";
  /** Linha extra ("Último acesso há 22 dias", "2 parcelas atrasadas"...). */
  extra: string | null;
}

const TOM_PONTO = {
  red: "bg-red-600",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  muted: "bg-neutral-400",
} as const;
const TOM_TEXTO = {
  red: "text-red-700 dark:text-red-400",
  amber: "text-amber-700 dark:text-amber-400",
  orange: "text-orange-700 dark:text-orange-400",
  muted: "text-muted-foreground",
} as const;

export function ClientesAtencao({ clientes }: { clientes: ClienteAtencao[] }) {
  return (
    <section className="overflow-hidden rounded-[10px] border bg-card">
      <div className="flex items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-[15px] font-semibold">Clientes com atenção</h2>
        <Link href="/painel/clientes" className="text-[13px] font-medium text-primary hover:underline">
          Ver todos
        </Link>
      </div>
      {clientes.length === 0 ? (
        <p className="border-t px-4 py-4 text-[13px] text-muted-foreground">
          Nenhum cliente precisando de atenção.
        </p>
      ) : (
        clientes.map((c) => (
          <Link
            key={c.id}
            href={`/painel/clientes?empresa=${c.id}`}
            className="flex items-center gap-2 border-t px-4 py-2.5 transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{c.nome}</span>
              <span className={cn("flex items-center gap-1.5 text-xs", TOM_TEXTO[c.tom])}>
                <span className={cn("size-1.5 shrink-0 rounded-full", TOM_PONTO[c.tom])} />
                <span className="truncate">{c.situacao}</span>
              </span>
              {c.extra ? (
                <span className="block truncate text-xs text-muted-foreground">{c.extra}</span>
              ) : null}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))
      )}
    </section>
  );
}
