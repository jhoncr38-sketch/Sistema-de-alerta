"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Loader2,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listarParcelasReceita,
  publicarParcelaReceita,
  type ListarParcelasResult,
  type ParcelaReceita,
} from "@/app/(admin)/painel/integracoes/serpro/actions";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/**
 * Lista as parcelas REAIS de parcelamento que a Receita tem para um cliente
 * (varrendo PARCSN/PARCMEI/etc.) e publica a escolhida como boleto no portal.
 * Não depende do parcelamento cadastrado no site — trabalha com o que a Receita
 * de fato disponibiliza, com o valor de cada parcela.
 */
export function EmitirParcelamentoCard({
  companies,
  configurado,
  bare = false,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
  bare?: boolean;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [buscando, startBuscar] = useTransition();
  const [res, setRes] = useState<ListarParcelasResult | null>(null);
  // Estado de publicação por parcela (chave = sistema+parcela).
  const [publicando, setPublicando] = useState<string | null>(null);
  const [pubMsg, setPubMsg] = useState<Record<string, { ok: boolean; texto: string }>>(
    {},
  );
  // Parcelas "já no portal" que o contador escolheu publicar mesmo assim.
  const [forcar, setForcar] = useState<Record<string, boolean>>({});

  function buscar() {
    setRes(null);
    setPubMsg({});
    setForcar({});
    startBuscar(async () => setRes(await listarParcelasReceita(companyId)));
  }

  async function publicar(p: ParcelaReceita) {
    const chave = `${p.sistema}-${p.parcela}`;
    setPublicando(chave);
    const r = await publicarParcelaReceita({
      companyId,
      sistema: p.sistema,
      parcela: p.parcela,
      valor: p.valor,
    });
    setPubMsg((m) => ({ ...m, [chave]: { ok: r.ok, texto: `${r.titulo}. ${r.detalhe}` } }));
    setPublicando(null);
  }

  const Wrapper = bare ? "div" : Card;
  return (
    <Wrapper className={bare ? "" : "max-w-3xl px-6 py-6"}>
      <div className="flex items-start gap-3">
        {bare ? null : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-5" />
          </div>
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Parcelamento na Receita</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Busca as parcelas que a Receita tem para o cliente (Simples, MEI,
              PERT, RELP) e publica a guia escolhida como boleto no portal.
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
                  disabled={buscando || !companyId}
                  onClick={buscar}
                >
                  {buscando ? <Loader2 className="animate-spin" /> : <Search />}
                  Buscar parcelas
                </Button>
              </div>

              {buscando ? (
                <p className="text-xs text-muted-foreground">
                  Consultando a Receita…
                </p>
              ) : null}

              {res ? (
                res.parcelas.length === 0 ? (
                  <div className="rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-900/50">
                    <p className="font-medium">{res.titulo}</p>
                    <p className="mt-0.5 text-muted-foreground">{res.detalhe}</p>
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {res.parcelas.map((p) => {
                      const chave = `${p.sistema}-${p.parcela}`;
                      const msg = pubMsg[chave];
                      return (
                        <div key={chave} className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium tabular-nums">
                                {p.label}
                              </span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {p.sistema}
                              </span>
                              {p.valor != null ? (
                                <span className="ml-2 text-sm tabular-nums">
                                  {p.valor.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </span>
                              ) : null}
                            </div>
                            {msg?.ok ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3.5" />
                                Publicada
                              </span>
                            ) : p.jaNoPortal && !forcar[chave] ? (
                              // Já existe uma guia dessa parcela (competência ou
                              // valor iguais) no portal — evita duplicar.
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="size-3.5" />
                                  Já no portal
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForcar((f) => ({ ...f, [chave]: true }))
                                  }
                                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  publicar mesmo assim
                                </button>
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={publicando === chave}
                                onClick={() => publicar(p)}
                              >
                                {publicando === chave ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Send />
                                )}
                                Publicar
                              </Button>
                            )}
                          </div>
                          {msg && !msg.ok ? (
                            <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                              <XCircle className="mt-0.5 size-3.5 shrink-0" />
                              {msg.texto}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}
            </>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
