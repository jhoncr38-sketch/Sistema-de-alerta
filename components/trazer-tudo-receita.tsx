"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Send } from "lucide-react";
import {
  buscarGuiasNaReceita,
  type GuiaSugerida,
  type GuiasDaEmpresa,
} from "@/app/(admin)/painel/enviar/receita-actions";
import { publicarGuiaDaReceita } from "@/app/(admin)/painel/integracoes/serpro/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

type EstadoGuia = {
  fase: "publicando" | "ok" | "erro";
  titulo?: string;
  detalhe?: string;
};

const chaveDe = (companyId: string, g: GuiaSugerida) => `${companyId}|${g.chave}`;

/**
 * "Trazer tudo da Receita": consulta a situação fiscal (e as parcelas) de TODOS
 * os clientes, monta uma lista única de guias para gerar — DAS, DAS-MEI, DARF e
 * parcelas —, o contador confere/desmarca e publica. Cada cliente recebe UM
 * e-mail com as guias dele. Um cliente por vez (a Receita leva alguns segundos
 * em cada relatório).
 */
export function TrazerTudoReceita({ companies }: { companies: CompanyOpt[] }) {
  const [incluirParcelas, setIncluirParcelas] = useState(true);
  const [avisar, setAvisar] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [resultados, setResultados] = useState<GuiasDaEmpresa[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<Record<string, EstadoGuia>>({});
  const [publicando, setPublicando] = useState(false);
  const [final, setFinal] = useState<string | null>(null);

  const nomeDe = (id: string) =>
    companies.find((c) => c.id === id)?.label.split(" — ")[0] ?? "Cliente";

  async function buscar() {
    setBuscando(true);
    setResultados(null);
    setEstado({});
    setFinal(null);
    setFeitos(0);
    const saida: GuiasDaEmpresa[] = [];
    for (const c of companies) {
      try {
        saida.push(await buscarGuiasNaReceita(c.id, incluirParcelas));
      } catch (e) {
        saida.push({
          companyId: c.id,
          ok: false,
          erro: e instanceof Error ? e.message : "Falha ao consultar a Receita.",
          guias: [],
          avisos: [],
        });
      }
      setFeitos((n) => n + 1);
    }
    setResultados(saida);
    // Já marcadas: o que ainda NÃO está no portal.
    setMarcadas(
      new Set(
        saida.flatMap((r) => r.guias.filter((g) => !g.noPortal).map((g) => chaveDe(r.companyId, g))),
      ),
    );
    setBuscando(false);
  }

  function alternar(k: string) {
    setMarcadas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function publicar() {
    if (!resultados) return;
    setPublicando(true);
    setFinal(null);
    const ids: string[] = [];
    let ok = 0;
    let falhas = 0;

    for (const r of resultados) {
      for (const g of r.guias) {
        const k = chaveDe(r.companyId, g);
        if (!marcadas.has(k)) continue;
        setEstado((s) => ({ ...s, [k]: { fase: "publicando" } }));
        let res: { ok: boolean; titulo: string; detalhe: string; documentId?: string };
        try {
          res = await publicarGuiaDaReceita(r.companyId, {
            tipo: g.tipo,
            periodo: g.periodo,
            origem: g.origem,
            codigos: g.codigos,
            sistema: g.sistema,
            parcela: g.parcela,
            valor: g.valor,
          });
        } catch (e) {
          res = {
            ok: false,
            titulo: "Falha ao publicar",
            detalhe: e instanceof Error ? e.message : "",
          };
        }
        setEstado((s) => ({
          ...s,
          [k]: { fase: res.ok ? "ok" : "erro", titulo: res.titulo, detalhe: res.detalhe },
        }));
        if (res.ok) {
          ok++;
          if (res.documentId) ids.push(res.documentId);
          // Publicada sai da seleção (clicar de novo não publica em dobro).
          setMarcadas((prev) => {
            const n = new Set(prev);
            n.delete(k);
            return n;
          });
        } else {
          falhas++;
        }
      }
    }

    let avisados = 0;
    if (avisar && ids.length > 0) {
      try {
        const resp = await fetch("/api/lote/notificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds: ids }),
        });
        avisados = ((await resp.json()) as { empresas?: number }).empresas ?? 0;
      } catch {
        /* o e-mail é best-effort; as guias já estão no portal */
      }
    }

    setFinal(
      `${ok} guia(s) publicada(s) no portal` +
        (falhas ? `; ${falhas} ficaram de fora (veja o motivo em cada uma)` : "") +
        "." +
        (avisar
          ? ids.length
            ? ` ${avisados} cliente(s) avisado(s) por e-mail.`
            : ""
          : " Nenhum e-mail enviado."),
    );
    setPublicando(false);
  }

  const todas = (resultados ?? []).flatMap((r) => r.guias.map((g) => ({ r, g })));
  const selecionadas = todas.filter(({ r, g }) => marcadas.has(chaveDe(r.companyId, g)));
  const total = selecionadas.reduce((s, { g }) => s + (g.valor ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <p>
          Consulta na Receita a situação fiscal dos <strong>{companies.length} clientes</strong> e
          monta uma lista única de guias para gerar — DAS, DAS-MEI, DARF e parcelas. Você confere,
          desmarca o que não quiser e publica.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={incluirParcelas}
            disabled={buscando}
            onChange={(e) => setIncluirParcelas(e.target.checked)}
          />
          Incluir parcelas de parcelamento
          <span className="text-xs text-muted-foreground">(mais 4 consultas por cliente)</span>
        </label>
      </div>

      <Button type="button" disabled={buscando || publicando} onClick={buscar}>
        {buscando ? <Loader2 className="animate-spin" /> : <Search />}
        {buscando
          ? `Consultando ${Math.min(feitos + 1, companies.length)} de ${companies.length}…`
          : resultados
            ? "Buscar de novo"
            : "Buscar em todos os clientes"}
      </Button>

      {resultados ? (
        <>
          {resultados.map((r) => (
            <section key={r.companyId} className="overflow-hidden rounded-lg border">
              <header className="flex items-baseline justify-between gap-2 bg-muted/40 px-3.5 py-2">
                <span className="text-sm font-semibold">{nomeDe(r.companyId)}</span>
                <span className="text-xs text-muted-foreground">
                  {r.ok ? `${r.guias.length} guia(s)` : "não consultado"}
                </span>
              </header>

              {!r.ok ? (
                <p className="flex items-start gap-1.5 px-3.5 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {r.erro}
                </p>
              ) : r.guias.length === 0 ? (
                <p className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> Nada em aberto para gerar.
                </p>
              ) : (
                r.guias.map((g) => {
                  const k = chaveDe(r.companyId, g);
                  const est = estado[k];
                  return (
                    <label
                      key={g.chave}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border-t px-3.5 py-2.5",
                        est?.fase === "ok" && "cursor-default bg-emerald-50/50 dark:bg-emerald-950/20",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={marcadas.has(k)}
                        disabled={publicando || est?.fase === "ok"}
                        onChange={() => alternar(k)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{g.titulo}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className={cn(g.vencido && "text-red-700 dark:text-red-400")}>
                            {g.detalhe}
                          </span>
                          {g.noPortal ? (
                            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              {g.noPortal === "pago"
                                ? "já pago/aguardando no portal"
                                : "já no portal — publicar atualiza"}
                            </span>
                          ) : null}
                        </div>
                        {est?.fase === "ok" ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> {est.titulo}
                          </div>
                        ) : est?.fase === "erro" ? (
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                              {est.titulo}
                              {est.detalhe ? ` — ${est.detalhe}` : ""}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-sm font-semibold tabular-nums">
                        {est?.fase === "publicando" ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {g.valor != null ? formatCurrency(g.valor) : "—"}
                      </div>
                    </label>
                  );
                })
              )}

              {r.avisos.length > 0 ? (
                <details className="border-t px-3.5 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {r.avisos.length} pendência(s) que não viram guia aqui
                  </summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {r.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          ))}

          {todas.length > 0 ? (
            <div className="sticky bottom-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-sm">
              <div className="text-sm">
                <strong>{selecionadas.length}</strong> guia(s) marcada(s) ·{" "}
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={avisar}
                  disabled={publicando}
                  onChange={(e) => setAvisar(e.target.checked)}
                />
                Avisar os clientes por e-mail (1 por cliente)
              </label>
              <Button
                type="button"
                className="ml-auto"
                disabled={selecionadas.length === 0 || publicando || buscando}
                onClick={publicar}
              >
                {publicando ? <Loader2 className="animate-spin" /> : <Send />}
                Gerar e publicar no portal
              </Button>
            </div>
          ) : null}

          {final ? (
            <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {final}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
