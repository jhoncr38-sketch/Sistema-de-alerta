"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  Landmark,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  gerarDarf,
  publicarDarf,
  type DarfGerarResult,
  type PublicarDarfResult,
} from "@/app/(admin)/painel/integracoes/serpro/actions";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

const CATEGORIAS = [
  { valor: "GERAL_MENSAL", label: "Geral — mensal" },
  { valor: "13_SALARIO", label: "13º salário" },
  { valor: "GERAL_ESPECIAL", label: "Espetáculo / especial" },
  { valor: "AFERICAO", label: "Aferição de obra" },
  { valor: "RECLAMATORIA", label: "Reclamatória trabalhista" },
];

const TIPOS = [
  { valor: "darf_piscofins", label: "DARF PIS/COFINS" },
  { valor: "gps_inss", label: "INSS (GPS)" },
  { valor: "darf_irpj", label: "DARF IRPJ" },
  { valor: "darf_csll", label: "DARF CSLL" },
  { valor: "outro", label: "DARF (geral / DCTFWeb)" },
];

function anoMesAnterior() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { ano: String(d.getFullYear()), mes: String(d.getMonth() + 1).padStart(2, "0") };
}

/**
 * Emitir o DARF da DCTFWeb (INSS/PIS/COFINS/IRPJ/CSLL) e publicar como boleto.
 * A Receita devolve só o PDF — então o contador confere o PDF e informa valor,
 * vencimento e o rótulo do tributo antes de publicar (aí entra nos alertas).
 */
export function EmitirDarfCard({
  companies,
  configurado,
  bare = false,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
  bare?: boolean;
}) {
  const inicial = anoMesAnterior();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [categoria, setCategoria] = useState("GERAL_MENSAL");
  const [ano, setAno] = useState(inicial.ano);
  const [mes, setMes] = useState(inicial.mes);

  const [gerando, startGerar] = useTransition();
  const [publicando, startPublicar] = useTransition();
  const [darf, setDarf] = useState<DarfGerarResult | null>(null);
  const [pub, setPub] = useState<PublicarDarfResult | null>(null);

  // Campos que o contador preenche depois de conferir o PDF.
  const [tipo, setTipo] = useState("darf_piscofins");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");

  function gerar() {
    setDarf(null);
    setPub(null);
    startGerar(async () => setDarf(await gerarDarf(companyId, categoria, ano, mes)));
  }

  function publicar() {
    setPub(null);
    // "1.234,56" ou "1234.56" -> número
    let s = valor.trim().replace(/\s|R\$/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const valorNum = Number(s);
    startPublicar(async () =>
      setPub(
        await publicarDarf({
          companyId,
          categoria,
          anoPA: ano,
          mesPA: mes,
          type: tipo,
          valor: valorNum,
          vencimento,
        }),
      ),
    );
  }

  const Wrapper = bare ? "div" : Card;
  return (
    <Wrapper className={bare ? "" : "max-w-3xl px-6 py-6"}>
      <div className="flex items-start gap-3">
        {bare ? null : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="size-5" />
          </div>
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">
              Emitir DARF (DCTFWeb — INSS, PIS/COFINS, IRPJ, CSLL)
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Gera o DARF dos tributos federais apurados na DCTFWeb. Você confere
              o PDF, informa o valor e o vencimento, e publica como boleto no
              portal do cliente.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A 2ª via serve para reemitir a guia quando o cliente perdeu o
              boleto ou o vencimento passou — a Receita gera com o valor
              atualizado (juros e multa, se houver).
            </p>
          </div>

          {!configurado ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              A integração com a Receita ainda não está configurada.
            </p>
          ) : (
            <>
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
                          {c.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Categoria
                  </span>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Ano
                    </span>
                    <input
                      value={ano}
                      onChange={(e) => setAno(e.target.value)}
                      inputMode="numeric"
                      className="h-9 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      Mês
                    </span>
                    <input
                      value={mes}
                      onChange={(e) => setMes(e.target.value)}
                      inputMode="numeric"
                      placeholder="MM"
                      className="h-9 w-16 rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </label>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={gerando || publicando || !companyId}
                onClick={gerar}
              >
                {gerando ? <Loader2 className="animate-spin" /> : <Landmark />}
                Gerar 2ª via
              </Button>

              {/* Resultado da geração */}
              {darf ? (
                <div
                  className={
                    darf.ok
                      ? "rounded-lg border border-emerald-300 p-4 dark:border-emerald-900/50"
                      : "rounded-lg border border-red-300 p-4 dark:border-red-900/50"
                  }
                >
                  <div className="flex items-start gap-2">
                    {darf.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{darf.titulo}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {darf.detalhe}
                      </p>

                      {darf.ok && darf.pdfBase64 ? (
                        <div className="mt-3 space-y-3">
                          <iframe
                            title="DARF gerado"
                            src={`data:application/pdf;base64,${darf.pdfBase64}`}
                            className="h-[55vh] w-full rounded-lg border bg-muted/30"
                          />

                          {/* Campos que o contador lê no PDF para publicar */}
                          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                            <label className="text-sm">
                              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                Tributo (rótulo)
                              </span>
                              <select
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value)}
                                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                {TIPOS.map((t) => (
                                  <option key={t.valor} value={t.valor}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm">
                              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                Valor (do DARF)
                              </span>
                              <input
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                inputMode="decimal"
                                placeholder="1.234,56"
                                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            </label>
                            <label className="text-sm">
                              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                Vencimento
                              </span>
                              <input
                                type="date"
                                value={vencimento}
                                onChange={(e) => setVencimento(e.target.value)}
                                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <a
                                  href={`data:application/pdf;base64,${darf.pdfBase64}`}
                                  download={`DARF-${ano}${mes}.pdf`}
                                >
                                  <Download />
                                  Baixar PDF
                                </a>
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                publicando ||
                                !!pub?.ok ||
                                !valor.trim() ||
                                !vencimento
                              }
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
