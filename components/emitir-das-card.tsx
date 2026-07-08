"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  emitirDasTeste,
  publicarDas,
  type DasTesteResult,
  type PublicarDasResult,
} from "@/app/(admin)/painel/integracoes/serpro/actions";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/** "AAAAMM" do mês anterior — padrão mais comum ao emitir o DAS do mês fechado. */
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Emitir DAS pela Receita direto na tela do contador. Fluxo em 2 passos, com
 * conferência no meio:
 *   1) escolhe cliente + mês -> "Gerar DAS" busca na Receita e mostra o PDF,
 *      valor e vencimento (nada publicado ainda);
 *   2) "Publicar no portal" cria o boleto para o cliente (com as regras de
 *      substituição/bloqueio da action publicarDas).
 * Reusa as server actions já testadas da integração SERPRO.
 */
export function EmitirDasCard({
  companies,
  configurado,
  bare = false,
}: {
  companies: CompanyOpt[];
  /** Credenciais SERPRO presentes? Se não, mostra aviso e desabilita. */
  configurado: boolean;
  /** Sem o <Card> externo (quando já vem dentro de um painel com abas). */
  bare?: boolean;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [periodo, setPeriodo] = useState(mesAnterior);

  const [gerando, startGerar] = useTransition();
  const [publicando, startPublicar] = useTransition();
  const [das, setDas] = useState<DasTesteResult | null>(null);
  const [pub, setPub] = useState<PublicarDasResult | null>(null);

  function gerar() {
    setDas(null);
    setPub(null);
    startGerar(async () => setDas(await emitirDasTeste(companyId, periodo)));
  }

  function publicar() {
    setPub(null);
    startPublicar(async () => setPub(await publicarDas(companyId, periodo)));
  }

  const venBR = das?.vencimento?.split("-").reverse().join("/");

  const Wrapper = bare ? "div" : Card;
  return (
    <Wrapper className={bare ? "" : "max-w-3xl px-6 py-6"}>
      <div className="flex items-start gap-3">
        {bare ? null : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Emitir DAS pela Receita</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Gera o DAS do Simples Nacional direto na Receita e publica no
              portal do cliente — sem baixar e anexar na mão. Você confere o
              valor e o vencimento antes de publicar.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A 2ª via serve para reemitir a guia quando o cliente perdeu o
              boleto ou o vencimento passou — a Receita gera com o valor
              atualizado (juros e multa, se houver).
            </p>
          </div>

          {!configurado ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              A integração com a Receita ainda não está configurada. Fale com o
              suporte para ativar.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Cliente
                  </span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {companies.length === 0 ? (
                      <option value="">Nenhum cliente com CNPJ</option>
                    ) : (
                      companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Mês (AAAAMM)
                  </span>
                  <input
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    inputMode="numeric"
                    placeholder="202506"
                    className="h-9 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={gerando || publicando || !companyId}
                onClick={gerar}
              >
                {gerando ? <Loader2 className="animate-spin" /> : <FileText />}
                Gerar 2ª via
              </Button>

              {/* ----- Resultado da geração ----- */}
              {das ? (
                <div
                  className={
                    das.ok
                      ? "rounded-lg border border-emerald-300 p-4 dark:border-emerald-900/50"
                      : "rounded-lg border border-red-300 p-4 dark:border-red-900/50"
                  }
                >
                  <div className="flex items-start gap-2">
                    {das.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{das.titulo}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {das.detalhe}
                      </p>

                      {das.ok && das.pdfBase64 ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            {das.valor != null ? (
                              <span>
                                <span className="text-muted-foreground">
                                  Valor:{" "}
                                </span>
                                <strong className="tabular-nums">
                                  {das.valor.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </strong>
                              </span>
                            ) : null}
                            {venBR ? (
                              <span>
                                <span className="text-muted-foreground">
                                  Vencimento:{" "}
                                </span>
                                <strong className="tabular-nums">{venBR}</strong>
                              </span>
                            ) : null}
                          </div>

                          <iframe
                            title="DAS gerado"
                            src={`data:application/pdf;base64,${das.pdfBase64}`}
                            className="h-[60vh] w-full rounded-lg border bg-muted/30"
                          />

                          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <a
                                  href={`data:application/pdf;base64,${das.pdfBase64}`}
                                  download={`DAS-${periodo}.pdf`}
                                >
                                  <Download />
                                  Baixar PDF
                                </a>
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={publicando || !!pub?.ok}
                              onClick={publicar}
                            >
                              {publicando ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Send />
                              )}
                              Publicar no portal do cliente
                            </Button>
                          </div>

                          {pub ? (
                            <div
                              className={
                                pub.ok
                                  ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30"
                                  : "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm dark:border-red-900/50 dark:bg-red-950/30"
                              }
                            >
                              <span className="font-medium">{pub.titulo}.</span>{" "}
                              {pub.detalhe}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
