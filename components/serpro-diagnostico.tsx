"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plug,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  consultarCliente,
  emitirDasTeste,
  testarConexao,
  type DasTesteResult,
  type TesteResult,
} from "@/app/(admin)/painel/integracoes/serpro/actions";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/**
 * Painel de diagnóstico da integração SERPRO. Dois testes seguros e manuais:
 *   1) Testar conexão — só autentica (prova certificado + chaves);
 *   2) Consultar cliente — uma leitura real sobre um cliente (não emite nada).
 * O resultado bruto é mostrado para o contador conferir o que a Receita devolve.
 */
export function SerproDiagnostico({
  configurado,
  companies,
}: {
  configurado: boolean;
  companies: CompanyOpt[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TesteResult | null>(null);
  const [acao, setAcao] = useState<"conexao" | "consulta" | "das" | null>(null);

  // Campos da consulta de teste. Padrão: consulta do PGDASD (Simples Nacional).
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [idSistema, setIdSistema] = useState("PGDASD");
  const [idServico, setIdServico] = useState("CONSDECLARACAO13");
  // CONSDECLARACAO13 lista as declarações do Simples do ano informado.
  const [dados, setDados] = useState('{ "anoCalendario": "2024" }');

  // Emissão de DAS (Fatia 2): cliente + período AAAAMM. Padrão: mês anterior.
  const [dasCompanyId, setDasCompanyId] = useState(companies[0]?.id ?? "");
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [das, setDas] = useState<DasTesteResult | null>(null);

  function runConexao() {
    setAcao("conexao");
    setResult(null);
    startTransition(async () => setResult(await testarConexao()));
  }

  function runConsulta() {
    setAcao("consulta");
    setResult(null);
    startTransition(async () =>
      setResult(await consultarCliente(companyId, idSistema, idServico, dados)),
    );
  }

  function runDas() {
    setAcao("das");
    setDas(null);
    startTransition(async () =>
      setDas(await emitirDasTeste(dasCompanyId, periodo)),
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Etapa 1: testar conexão ---- */}
      <Card className="px-5 py-4">
        <div className="flex items-start gap-3">
          <Plug className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">1. Testar conexão</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Autentica no SERPRO com o seu certificado e as chaves. Não consulta
              nem altera nada — é só para provar que a credencial funciona.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              disabled={!configurado || pending}
              onClick={runConexao}
            >
              {pending && acao === "conexao" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plug />
              )}
              Testar conexão
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- Etapa 2: consulta de teste (só leitura) ---- */}
      <Card className="px-5 py-4">
        <div className="flex items-start gap-3">
          <Search className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                2. Consultar um cliente (só leitura)
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Faz uma consulta real na Receita em nome de um cliente (via sua
                procuração). Não emite guia nem altera nada.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
                        {c.label} · {c.cnpj}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    idSistema
                  </span>
                  <input
                    value={idSistema}
                    onChange={(e) => setIdSistema(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    idServico
                  </span>
                  <input
                    value={idServico}
                    onChange={(e) => setIdServico(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>
              </div>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                dados (JSON do serviço)
              </span>
              <textarea
                value={dados}
                onChange={(e) => setDados(e.target.value)}
                rows={2}
                spellCheck={false}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!configurado || pending || !companyId}
              onClick={runConsulta}
            >
              {pending && acao === "consulta" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Search />
              )}
              Consultar
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- Etapa 3: emitir DAS (gera guia, mas NÃO publica) ---- */}
      <Card className="px-5 py-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                3. Emitir DAS (Simples Nacional)
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Gera o DAS de um cliente para conferência.{" "}
                <strong>Nada é publicado nem enviado ao cliente</strong> — o PDF
                aparece aqui só para você validar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Cliente
                </span>
                <select
                  value={dasCompanyId}
                  onChange={(e) => setDasCompanyId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {companies.length === 0 ? (
                    <option value="">Nenhum cliente com CNPJ</option>
                  ) : (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.cnpj}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Período de apuração (AAAAMM)
                </span>
                <input
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  inputMode="numeric"
                  placeholder="202506"
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </div>

            <Button
              type="button"
              size="sm"
              disabled={!configurado || pending || !dasCompanyId}
              onClick={runDas}
            >
              {pending && acao === "das" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileText />
              )}
              Gerar DAS
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- Resultado do DAS ---- */}
      {das ? (
        <Card
          className={
            das.ok
              ? "border-emerald-300 px-5 py-4 dark:border-emerald-900/50"
              : "border-red-300 px-5 py-4 dark:border-red-900/50"
          }
        >
          <div className="flex items-start gap-2.5">
            {das.ok ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{das.titulo}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {das.detalhe}
              </p>

              {das.ok && das.pdfBase64 ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {das.valor != null ? (
                      <span>
                        <span className="text-muted-foreground">Valor: </span>
                        <strong className="tabular-nums">
                          {das.valor.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </strong>
                      </span>
                    ) : null}
                    {das.vencimento ? (
                      <span>
                        <span className="text-muted-foreground">
                          Vencimento:{" "}
                        </span>
                        <strong className="tabular-nums">
                          {das.vencimento.split("-").reverse().join("/")}
                        </strong>
                      </span>
                    ) : null}
                    {das.numeroDocumento ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Nº {das.numeroDocumento}
                      </span>
                    ) : null}
                  </div>

                  <iframe
                    title="DAS gerado"
                    src={`data:application/pdf;base64,${das.pdfBase64}`}
                    className="h-[70vh] w-full rounded-lg border bg-muted/30"
                  />

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
                </div>
              ) : das.raw ? (
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {das.raw}
                </pre>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* ---- Resultado ---- */}
      {result ? (
        <Card
          className={
            result.ok
              ? "border-emerald-300 px-5 py-4 dark:border-emerald-900/50"
              : "border-red-300 px-5 py-4 dark:border-red-900/50"
          }
        >
          <div className="flex items-start gap-2.5">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{result.titulo}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {result.detalhe}
              </p>
              {result.raw ? (
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {result.raw}
                </pre>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
