"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { ExplicarGuiaButton } from "@/components/explicar-guia-button";
import { ParcelasTable } from "@/components/parcelas-table";
import {
  BaixarGuiaAcao,
  JaPagueiAcao,
  PedirSegundaViaAcao,
} from "@/components/portal/acoes-guia";
import { formatCurrency } from "@/lib/format";
import type { EstadoParcela, LeituraPlano } from "@/lib/parcelamento-portal";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PlanoResumo {
  id: string;
  nome: string;
  href: string;
  pagas: number;
  total: number;
  pct: number;
  atrasado: boolean;
  /** Texto da situação: "Parcela 23 atrasada", "Débito automático · 30/10"... */
  situacao: string;
  /** Versão do celular (com a data): "Parcela 23 atrasada · 30/09". */
  situacaoCelular: string;
  tom: "red" | "green" | "muted" | "primary";
  /** Parcela atrasada para o botão "Pedir 2ª via" no celular. */
  atrasadaId: string | null;
}

const TOM_TEXTO = {
  red: "text-red-700 dark:text-red-400",
  green: "text-emerald-600 dark:text-emerald-400",
  muted: "text-muted-foreground",
  primary: "text-primary",
  amber: "text-amber-700 dark:text-amber-400",
} as const;
const TOM_PONTO = {
  red: "bg-red-600",
  green: "bg-emerald-600",
  muted: "bg-neutral-400",
  primary: "bg-primary",
  amber: "bg-amber-500",
} as const;

/** Barra fina de progresso com o segmento vermelho da parcela atrasada. */
function Barra({ p, forte }: { p: PlanoResumo; forte: boolean }) {
  const fatia = p.total > 0 ? 100 / p.total : 0;
  return (
    <div className="flex h-1 overflow-hidden rounded-full bg-muted">
      <div
        className={forte ? "bg-emerald-600" : "bg-emerald-300 dark:bg-emerald-700"}
        style={{ width: `${p.pct}%` }}
      />
      {p.atrasado ? <div className="bg-red-600" style={{ width: `${fatia}%` }} /> : null}
    </div>
  );
}

/** Seletor de planos (desktop): mini-cartões; o selecionado ganha destaque. */
export function SeletorPlanos({
  planos,
  selecionadoId,
}: {
  planos: PlanoResumo[];
  selecionadoId: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
      {planos.map((p) => {
        const sel = p.id === selecionadoId;
        return (
          <Link
            key={p.id}
            href={p.href}
            scroll={false}
            aria-current={sel ? "true" : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 transition-colors",
              sel
                ? "border-neutral-300 bg-card shadow-sm dark:border-neutral-700"
                : "hover:bg-card",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "truncate text-sm font-semibold",
                  !sel && "text-neutral-600 dark:text-neutral-400",
                )}
              >
                {p.nome}
              </span>
              <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                {p.pagas}/{p.total}
              </span>
            </div>
            <Barra p={p} forte={sel} />
            <span className={cn("flex items-center gap-1.5 text-xs", TOM_TEXTO[p.tom])}>
              <span className={cn("size-1.5 shrink-0 rounded-full", TOM_PONTO[p.tom])} />
              <span className="truncate">{p.situacao}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Lista de planos (celular): uma linha por plano, toque abre o detalhe. */
export function ListaPlanosCelular({ planos }: { planos: PlanoResumo[] }) {
  return (
    <div className="divide-y overflow-hidden rounded-[10px] border bg-card">
      {planos.map((p) => (
        <div key={p.id} className="px-3.5 py-3">
          <Link href={p.href} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{p.nome}</span>
              <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                {p.pagas}/{p.total}
              </span>
            </div>
            <Barra p={p} forte />
            <span className="flex items-center justify-between gap-2">
              <span className={cn("truncate text-xs", TOM_TEXTO[p.tom])}>
                {p.situacaoCelular}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </span>
          </Link>
          {p.atrasadaId ? (
            <div className="mt-2.5 flex">
              <PedirSegundaViaAcao docId={p.atrasadaId} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const CELULA: Record<EstadoParcela, string> = {
  paga: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  atrasada:
    "bg-red-200 text-red-800 ring-2 ring-red-300 ring-offset-2 ring-offset-card dark:bg-red-900/60 dark:text-red-200 dark:ring-red-800",
  proxima: "bg-card text-primary ring-2 ring-primary ring-inset",
  contador: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  a_vir: "bg-muted text-neutral-400 dark:text-neutral-500",
};

/** Rola até a linha da parcela visível (a tabela tem versão celular e desktop). */
function rolarAte(num: number) {
  const alvos = document.querySelectorAll<HTMLElement>(`[data-parcela="${num}"]`);
  const visivel = [...alvos].find((el) => el.offsetParent !== null);
  visivel?.scrollIntoView({ behavior: "smooth", block: "center" });
  visivel?.classList.add("bg-primary/5");
  setTimeout(() => visivel?.classList.remove("bg-primary/5"), 1600);
}

/**
 * Detalhe do parcelamento (redesenho 10a): título, resumo em 4 números, mapa
 * de parcelas, parcelas relevantes e "Ver todas" (tabela completa).
 */
export function PlanoDetalhe({
  nome,
  subtitulo,
  subtituloCelular,
  leitura,
  parcelas,
  debitoAutomatico,
  voltarHref,
}: {
  nome: string;
  subtitulo: string;
  subtituloCelular: string;
  leitura: LeituraPlano;
  parcelas: DocumentRow[];
  debitoAutomatico: boolean;
  voltarHref: string;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const l = leitura;

  function clicarCelula(num: number) {
    if (!verTodas) {
      setVerTodas(true);
      setTimeout(() => rolarAte(num), 60);
    } else {
      rolarAte(num);
    }
  }

  const resumo = [
    { rotulo: "Pagas", valor: `${l.pagas} de ${l.total}`, sub: `${l.pct}% concluído` },
    {
      rotulo: "Valor da parcela",
      valor: l.valorParcela != null ? formatCurrency(l.valorParcela) : "—",
      sub: "",
    },
    {
      rotulo: "Saldo restante",
      valor: formatCurrency(l.saldo),
      sub: `${l.restantes} ${l.restantes === 1 ? "parcela" : "parcelas"}`,
    },
    { rotulo: "Termina em", valor: l.terminaEm ?? "—", sub: "" },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {/* Título */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Link
            href={voltarHref}
            aria-label="Voltar para a lista"
            className="mt-0.5 -ml-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight md:text-xl">{nome}</h2>
            <p className="text-[13px] text-muted-foreground">
              <span className="hidden md:inline">{subtitulo}</span>
              <span className="md:hidden">{subtituloCelular}</span>
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 md:inline-flex">
          <ExplicarGuiaButton
            type="outro"
            label="Parcelamento"
            categoria="parcelamento"
            linkTexto="O que é um parcelamento?"
          />
        </span>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 rounded-[10px] border bg-card px-4 py-3.5 md:grid-cols-4">
        {resumo.map((r, i) => (
          // Celular: só Pagas e Saldo.
          <div key={r.rotulo} className={cn((i === 1 || i === 3) && "hidden md:block")}>
            <div className="text-xs text-muted-foreground">{r.rotulo}</div>
            <div className="text-[15px] font-semibold tabular-nums">{r.valor}</div>
            {r.sub ? <div className="text-xs text-muted-foreground">{r.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Mapa de parcelas */}
      <div className="rounded-[10px] border bg-card px-4 py-3.5">
        <div className="mb-2.5 hidden items-center justify-between gap-3 md:flex">
          <span className="text-xs text-muted-foreground">Todas as parcelas</span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {(
              [
                ["paga", "Paga"],
                ["atrasada", "Atrasada"],
                ["proxima", "Próxima"],
                ["a_vir", "A vir"],
              ] as const
            ).map(([e, t]) => (
              <span key={e} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-[9px] rounded-[2px]",
                    e === "atrasada"
                      ? "bg-red-200 dark:bg-red-900/60"
                      : e === "proxima"
                        ? "ring-1 ring-primary ring-inset"
                        : CELULA[e],
                  )}
                />
                {t}
              </span>
            ))}
          </span>
        </div>
        <div className="grid grid-cols-10 gap-1 md:grid-cols-20">
          {l.celulas.map((c) => (
            <button
              key={c.num}
              type="button"
              title={c.dica}
              onClick={() => clicarCelula(c.num)}
              className={cn(
                "flex h-6 items-center justify-center rounded-[5px] text-[10px] font-semibold tabular-nums",
                CELULA[c.estado],
              )}
            >
              {c.num}
            </button>
          ))}
        </div>
      </div>

      {/* Parcelas relevantes */}
      <div className="overflow-hidden rounded-[10px] border bg-card">
        {l.relevantes.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">
            {l.pagas >= l.total
              ? "Todas as parcelas foram pagas."
              : "Nenhuma parcela em aberto no momento."}
          </div>
        ) : (
          l.relevantes.map((r, i) => (
            <div
              key={r.num}
              className={cn(
                "px-3.5 py-2.5 md:grid md:h-[46px] md:grid-cols-[70px_minmax(0,1fr)_110px_190px] md:items-center md:gap-3 md:py-0",
                i > 0 && "border-t",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">
                  <span className="hidden md:inline">Nº {r.num}</span>
                  <span className="md:hidden">Parcela {r.num}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums md:hidden">
                  {r.valor != null ? formatCurrency(r.valor) : "—"}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-3 md:mt-0">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  <span className={cn("size-[7px] shrink-0 rounded-full", TOM_PONTO[r.tom])} />
                  <span className={cn("shrink-0 font-medium", TOM_TEXTO[r.tom])}>{r.rotulo}</span>
                  {r.detalhe ? (
                    <span className="truncate text-muted-foreground">· {r.detalhe}</span>
                  ) : null}
                </span>
                <span className="shrink-0 md:hidden">
                  {r.id && !debitoAutomatico && r.situacao === "precisa" ? (
                    <PedirSegundaViaAcao docId={r.id} tamanho="text" />
                  ) : r.id && !debitoAutomatico && r.situacao === "a_pagar" && r.temArquivo ? (
                    <BaixarGuiaAcao docId={r.id} tamanho="text" />
                  ) : null}
                </span>
              </div>
              <span className="hidden text-right text-sm font-semibold tabular-nums md:block">
                {r.valor != null ? formatCurrency(r.valor) : "—"}
              </span>
              <div className="hidden items-center justify-end gap-2 md:flex">
                {r.nota ? (
                  <span className="text-xs text-muted-foreground">{r.nota}</span>
                ) : r.id && r.situacao === "precisa" ? (
                  <>
                    <JaPagueiAcao docId={r.id} exigeComprovante={r.exigeComprovante} variante="icon" />
                    <PedirSegundaViaAcao docId={r.id} tamanho="sm" />
                  </>
                ) : r.id && r.situacao === "a_pagar" && !debitoAutomatico ? (
                  <>
                    <JaPagueiAcao docId={r.id} exigeComprovante={r.exigeComprovante} variante="icon" />
                    {r.temArquivo ? <BaixarGuiaAcao docId={r.id} tamanho="sm" /> : null}
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
        <div className="flex h-[38px] items-center justify-between gap-3 border-t bg-neutral-50 px-3.5 text-[13px] text-muted-foreground dark:bg-muted/40">
          <span className="flex items-center gap-1">
            {l.pagas} {l.pagas === 1 ? "paga" : "pagas"}
            {l.semComprovante > 0 ? (
              <>
                {" "}· <Paperclip className="size-3" /> {l.semComprovante} sem comprovante
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => setVerTodas((v) => !v)}
            className="font-medium text-primary hover:underline"
          >
            {verTodas ? "Ocultar parcelas" : `Ver as ${l.total} parcelas`}
          </button>
        </div>
      </div>

      {verTodas ? (
        <ParcelasTable
          parcelas={parcelas}
          total={l.total}
          showPaid
          debitoAutomatico={debitoAutomatico}
          enforceProof
        />
      ) : null}
    </div>
  );
}
