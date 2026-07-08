"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  consultarSitfis,
  publicarSitfis,
  type SitfisConsultaResult,
} from "@/app/(admin)/painel/integracoes/serpro/actions";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/**
 * Consulta a situação fiscal do cliente na Receita (SITFIS) e, opcionalmente,
 * publica o relatório no portal dele como documento. A consulta é assíncrona
 * (pode levar alguns segundos) — o botão mostra o loading enquanto processa.
 */
export function SituacaoFiscalCard({
  companies,
  configurado,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [consultando, startConsultar] = useTransition();
  const [publicando, startPublicar] = useTransition();
  const [res, setRes] = useState<SitfisConsultaResult | null>(null);
  const [pub, setPub] = useState<SitfisConsultaResult | null>(null);

  function consultar() {
    setRes(null);
    setPub(null);
    startConsultar(async () => setRes(await consultarSitfis(companyId)));
  }

  function publicar() {
    setPub(null);
    startPublicar(async () => setPub(await publicarSitfis(companyId)));
  }

  return (
    <Card className="max-w-3xl px-6 py-6">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Situação fiscal na Receita</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Consulta as pendências e a situação fiscal do cliente direto na
              Receita Federal. Você vê o relatório na hora e pode publicá-lo no
              portal do cliente.
            </p>
          </div>

          {!configurado ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              A integração com a Receita ainda não está configurada.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Cliente
                  </span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="h-9 w-full min-w-64 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                <Button
                  type="button"
                  size="sm"
                  disabled={consultando || publicando || !companyId}
                  onClick={consultar}
                >
                  {consultando ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Search />
                  )}
                  Consultar situação fiscal
                </Button>
              </div>

              {consultando ? (
                <p className="text-xs text-muted-foreground">
                  Consultando a Receita… isso pode levar alguns segundos.
                </p>
              ) : null}

              {/* Resultado da consulta */}
              {res ? (
                <div
                  className={
                    res.ok
                      ? "rounded-lg border border-emerald-300 p-4 dark:border-emerald-900/50"
                      : "rounded-lg border border-red-300 p-4 dark:border-red-900/50"
                  }
                >
                  <div className="flex items-start gap-2">
                    {res.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{res.titulo}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {res.detalhe}
                      </p>

                      {res.ok && res.pdfBase64 ? (
                        <div className="mt-3 space-y-3">
                          <iframe
                            title="Situação fiscal"
                            src={`data:application/pdf;base64,${res.pdfBase64}`}
                            className="h-[60vh] w-full rounded-lg border bg-muted/30"
                          />
                          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <a
                                  href={`data:application/pdf;base64,${res.pdfBase64}`}
                                  download="Situacao-Fiscal.pdf"
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
    </Card>
  );
}
