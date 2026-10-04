"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  Layers,
  Loader2,
  Scale,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  verificarPendencias,
  type DebitoNaTela,
  type Pendencias,
} from "@/app/(admin)/painel/enviar/receita-actions";
import { CollapsibleSection } from "@/components/collapsible-section";
import { EmitirDarfCard } from "@/components/emitir-darf-card";
import { EmitirDasCard } from "@/components/emitir-das-card";
import { EmitirParcelamentoCard } from "@/components/emitir-parcelamento-card";
import { SituacaoFiscalCard } from "@/components/situacao-fiscal-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { ORIGEM_ESOCIAL, ORIGEM_MIT } from "@/lib/serpro/origem";
import { mesAnoLabel } from "@/lib/portal";
import { cn } from "@/lib/utils";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/** Título de seção dentro do painel. */
function Secao({
  icon,
  titulo,
  extra,
  children,
}: {
  icon: React.ReactNode;
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** "Simples Nacional", "MEI" ou a receita como vem no relatório. */
function nomeReceita(d: DebitoNaTela): string {
  if (d.tipo === "simples") return "Simples Nacional (DAS)";
  if (d.tipo === "mei") return "MEI (DAS-MEI)";
  return d.receita;
}

/** "Julho 2026", "2º trimestre 2026", "Exercício 2025" ou a data do lançamento. */
function nomePeriodo(pa: string): string {
  const mes = pa.match(/^(\d{2})\/(\d{4})$/);
  if (mes) return mesAnoLabel(`${mes[2]}-${mes[1]}`);
  const tri = pa.match(/^(\d)º TRIM\/(\d{4})$/);
  if (tri) return `${tri[1]}º trimestre ${tri[2]}`;
  if (/^\d{4}$/.test(pa)) return `Exercício ${pa}`;
  return pa;
}

/** Abre o PDF (base64) numa aba nova, via blob (o navegador bloqueia data:). */
function abrirPdf(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Receita Federal (tela Enviar documento): escolhe o cliente UMA vez e vê o que
 * ele tem em aberto — lido do Relatório de Situação Fiscal (a fonte oficial):
 * débitos com saldo atualizado, omissões de declaração, parcelamentos em atraso
 * e PGFN. Cada débito do Simples abre a emissão do DAS; os demais, o DARF da
 * DCTFWeb. Reusa os cartões já testados (gerar → conferir → publicar).
 */
export function PainelReceita({
  companies,
  configurado,
  empresaInicial,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
  /** Cliente já escolhido (ex.: botão "Serpro" do Dashboard). */
  empresaInicial?: string;
}) {
  const [companyId, setCompanyId] = useState(
    empresaInicial && companies.some((c) => c.id === empresaInicial) ? empresaInicial : "",
  );
  // A cada "Verificar", remonta as seções (zera resultados antigos).
  const [verificacao, setVerificacao] = useState(0);
  const [verificando, startVerificar] = useTransition();
  const [pend, setPend] = useState<Pendencias | null>(null);
  // Débito cuja emissão está aberta (chave = receita|pa) ou "outro-das".
  const [aberto, setAberto] = useState<string | null>(null);

  function trocarCliente(id: string) {
    setCompanyId(id);
    setPend(null);
    setAberto(null);
    setVerificacao(0);
  }

  function verificar() {
    if (!companyId) return;
    setPend(null);
    setAberto(null);
    setVerificacao((v) => v + 1);
    startVerificar(async () => setPend(await verificarPendencias(companyId)));
  }

  const chave = `${companyId}-${verificacao}`;
  const total = (pend?.debitos ?? []).reduce((s, d) => s + d.saldoConsolidado, 0);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <Card className="max-w-4xl space-y-5 px-6 py-6">
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Landmark className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Receita Federal</h2>
          <p className="text-xs text-muted-foreground">
            Escolha o cliente e veja o que ele tem em aberto, direto do relatório
            de situação fiscal da Receita — com a guia pronta para conferir e
            publicar.
          </p>
        </div>
      </div>

      {!configurado ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          A integração com a Receita ainda não está configurada.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Cliente
            </span>
            <select
              value={companyId}
              onChange={(e) => trocarCliente(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Escolha o cliente…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!companyId || verificando}
            onClick={verificar}
          >
            {verificando ? <Loader2 className="animate-spin" /> : <Search />}
            Verificar pendências
          </Button>
        </div>
      )}

      {configurado && companyId && verificacao > 0 ? (
        <>
          {/* ----- Débitos em aberto (relatório de situação fiscal) ----- */}
          <Secao
            icon={<FileText />}
            titulo="Débitos em aberto na Receita"
            extra={
              pend?.ok && pend.debitos.length > 0 ? (
                <span className="text-sm text-muted-foreground">
                  Total hoje:{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCurrency(total)}
                  </strong>
                </span>
              ) : null
            }
          >
            {verificando || !pend ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Gerando o relatório de
                situação fiscal na Receita… (leva alguns segundos)
              </p>
            ) : !pend.ok ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                Não consegui verificar este cliente: {pend.erro}
              </p>
            ) : pend.debitos.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> Nenhum débito em aberto na
                Receita.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                {pend.debitos.map((d, i) => {
                  const id = `${d.receita}|${d.pa}`;
                  const vencido = d.vencimento < hoje;
                  // Simples → DAS do mês; demais (IRPJ, CSLL, PIS, COFINS, INSS)
                  // → DARF da DCTFWeb do mês da declaração, filtrado pela origem.
                  // Lançamento (multa com notificação) e MEI ficam sem botão.
                  const periodoEmissao =
                    d.tipo === "simples"
                      ? d.periodoMensal
                      : d.tipo === "outro" && !d.lancamento
                        ? d.periodoDctf
                        : null;
                  const acao = !periodoEmissao
                    ? null
                    : d.tipo === "simples"
                      ? "Gerar DAS atualizado"
                      : d.origem === ORIGEM_MIT
                        ? "Emitir DARF (só MIT)"
                        : d.origem === ORIGEM_ESOCIAL
                          ? "Emitir DARF (só INSS)"
                          : "Emitir DARF";
                  return (
                    <div key={id} className={cn(i > 0 && "border-t")}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {nomeReceita(d)} · {nomePeriodo(d.pa)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span
                              className={cn(
                                vencido
                                  ? "font-medium text-red-700 dark:text-red-400"
                                  : "text-primary",
                              )}
                            >
                              {vencido ? "Venceu" : "Vence"} {formatDate(d.vencimento)}
                            </span>
                            {" · original "}
                            {formatCurrency(d.valorOriginal)}
                            {d.multa + d.juros > 0
                              ? ` · multa e juros ${formatCurrency(d.multa + d.juros)}`
                              : ""}
                            {d.noPortal ? (
                              <span
                                className={cn(
                                  "ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  d.noPortal === "pago"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                                )}
                              >
                                {d.noPortal === "pago"
                                  ? "marcado como pago no portal"
                                  : "já publicado no portal (em aberto)"}
                              </span>
                            ) : null}
                          </div>
                          {d.obs ? (
                            <div className="text-[11px] text-muted-foreground">{d.obs}</div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums">
                            {formatCurrency(d.saldoConsolidado)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {d.situacao.toLowerCase()}
                          </div>
                        </div>
                        {acao ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={aberto === id ? "outline" : "default"}
                            onClick={() => setAberto((v) => (v === id ? null : id))}
                          >
                            {aberto === id ? "Fechar" : acao}
                          </Button>
                        ) : (
                          <span className="w-[160px] text-right text-xs text-muted-foreground">
                            {d.tipo === "mei"
                              ? "DAS-MEI: emissão pelo PGMEI ainda não integrada"
                              : d.lancamento
                                ? "Lançamento/multa: pague pela notificação no e-CAC"
                                : "—"}
                          </span>
                        )}
                      </div>
                      {aberto === id && periodoEmissao ? (
                        <div className="border-t bg-muted/20 px-3.5 py-4">
                          {d.tipo === "simples" ? (
                            <EmitirDasCard
                              key={`${chave}-${id}`}
                              companies={companies}
                              configurado={configurado}
                              bare
                              semIntro
                              clienteFixo={companyId}
                              periodoInicial={periodoEmissao}
                            />
                          ) : (
                            <EmitirDarfCard
                              key={`${chave}-${id}`}
                              companies={companies}
                              configurado={configurado}
                              bare
                              semIntro
                              clienteFixo={companyId}
                              periodoInicial={periodoEmissao}
                              origemInicial={d.origem}
                              // O que a situação fiscal diz estar em débito na
                              // mesma declaração — o resto no DARF gera aviso.
                              codigosEmAberto={pend.debitos
                                .filter(
                                  (x) =>
                                    x.tipo === "outro" &&
                                    !x.lancamento &&
                                    x.periodoDctf === d.periodoDctf,
                                )
                                .map((x) => x.receita.slice(0, 4))}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {pend?.ok ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {pend.pdfBase64 ? (
                  <button
                    type="button"
                    onClick={() => abrirPdf(pend.pdfBase64!)}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Ver o relatório completo (PDF)
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAberto((v) => (v === "outro-das" ? null : "outro-das"))}
                  className="text-[13px] font-medium text-primary hover:underline"
                >
                  {aberto === "outro-das" ? "Fechar" : "Gerar o DAS de outro mês"}
                </button>
              </div>
            ) : null}
            {aberto === "outro-das" ? (
              <div className="rounded-lg border bg-muted/20 px-3.5 py-4">
                <EmitirDasCard
                  key={`${chave}-outro`}
                  companies={companies}
                  configurado={configurado}
                  bare
                  semIntro
                  clienteFixo={companyId}
                />
              </div>
            ) : null}
          </Secao>

          {/* ----- Omissões e demais pendências ----- */}
          {pend?.ok && (pend.omissoes.length > 0 || pend.outras.length > 0) ? (
            <Secao icon={<AlertTriangle />} titulo="Outras pendências na Receita">
              <div className="space-y-2">
                {pend.omissoes.map((o) => (
                  <p
                    key={o}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <strong>Declaração não entregue</strong> — {o}
                  </p>
                ))}
                {pend.outras.map((o) => (
                  <div key={o.titulo} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="font-medium">{o.titulo}</div>
                    {o.linhas.map((l, i) => (
                      <div key={i} className="text-muted-foreground">
                        {l}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Secao>
          ) : null}

          {/* ----- PGFN ----- */}
          {pend?.ok ? (
            <Secao icon={<Scale />} titulo="Procuradoria (PGFN)">
              {pend.pgfn.semPendencias && pend.pgfn.secoes.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Sem pendências na PGFN.
                </p>
              ) : (
                <div className="space-y-2">
                  {pend.pgfn.secoes.map((s) => (
                    // Listas longas (inscrições, parcelamentos) começam fechadas.
                    <details key={s.titulo} className="rounded-lg border px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-medium">
                        {s.titulo}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({s.linhas.length} {s.linhas.length === 1 ? "linha" : "linhas"})
                        </span>
                      </summary>
                      <div className="mt-2 space-y-0.5 text-muted-foreground">
                        {s.linhas.map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </Secao>
          ) : null}

          {/* ----- Parcelas para emitir ----- */}
          <Secao icon={<Layers />} titulo="Parcelas de parcelamento para emitir">
            <EmitirParcelamentoCard
              key={`${chave}-parc`}
              companies={companies}
              configurado={configurado}
              bare
              semIntro
              clienteFixo={companyId}
              autoBuscar
            />
          </Secao>
        </>
      ) : null}

      {configurado && companyId ? (
        <div className="space-y-3 border-t pt-5 [&>div]:max-w-none">
          <CollapsibleSection
            key={`${companyId}-darf`}
            title="DARF da DCTFWeb de um mês"
            subtitle="INSS, PIS/COFINS, IRPJ, CSLL — escolha o mês"
            icon={<Landmark />}
          >
            <EmitirDarfCard
              companies={companies}
              configurado={configurado}
              bare
              semIntro
              clienteFixo={companyId}
            />
          </CollapsibleSection>
          <CollapsibleSection
            key={`${companyId}-sitfis`}
            title="Publicar a situação fiscal no portal"
            subtitle="Gera o relatório da Receita, explica com IA e envia ao cliente"
            icon={<ShieldCheck />}
          >
            <SituacaoFiscalCard
              companies={companies}
              configurado={configurado}
              bare
              semIntro
              clienteFixo={companyId}
            />
          </CollapsibleSection>
        </div>
      ) : null}
    </Card>
  );
}
