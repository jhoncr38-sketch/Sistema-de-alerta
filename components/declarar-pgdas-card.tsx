"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Download, Loader2, Plus, Send, Trash2 } from "lucide-react";
import {
  baseFatorR,
  faturamentoDoMes,
  municipiosDaUf,
  simularPgdas,
  transmitirPgdas,
  type BaseFatorR,
  type PgdasSimulacao,
  type PgdasTransmissao,
} from "@/app/(admin)/painel/enviar/pgdas-actions";
import { EmitirDasCard } from "@/components/emitir-das-card";
import { maskCurrency } from "@/components/masked-inputs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import {
  ANEXOS_PGDAS,
  atividadePgdas,
  ATIVIDADES_PGDAS,
  nomeAtividadePgdas,
  nomeQualificacao,
  QUALIF_ICMS,
  QUALIF_PIS_COFINS,
  TRIBUTOS_PGDAS,
} from "@/lib/serpro/pgdas-atividades";
import { cn } from "@/lib/utils";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/** Uma parcela de receita. A mesma atividade pode repetir (outro município, outra ST). */
interface Linha {
  chave: number;
  /** "" = ainda não escolhida. */
  idAtividade: string;
  /** Valor com máscara ("54.479,31"). */
  valor: string;
  /** ISS devido a outro município. */
  uf: string;
  municipio: string;
  /** Atividades "com substituição tributária": "" = tributação normal. */
  icms: string;
  pisCofins: string;
}

const linhaVazia = (chave: number, idAtividade = ""): Linha => ({
  chave,
  idAtividade,
  valor: "",
  uf: "",
  municipio: "",
  icms: "",
  pisCofins: "",
});

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const campo =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/** Os últimos `n` meses já encerrados, do mais recente ao mais antigo. */
function mesesEncerrados(n: number): { pa: string; rotulo: string }[] {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1 - i, 1);
    return {
      pa: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}`,
    };
  });
}

/** "54.479,31" → 54479.31 */
const numero = (mascarado: string) => Number(mascarado.replace(/\D/g, "") || "0") / 100;
const rotuloMes = (pa: string) => `${MESES[Number(pa.slice(4, 6)) - 1]} de ${pa.slice(0, 4)}`;
/** "202511" → "nov/2025" (cabe numa linha no quadro do fator “r”). */
const mesCurto = (pa: string) => `${MESES[Number(pa.slice(4, 6)) - 1].slice(0, 3)}/${pa.slice(0, 4)}`;

/** "20261010143000" → "10/10/2026 às 14:30" */
function dataHora(s: string | null | undefined): string {
  if (!s || s.length < 12) return "";
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)} às ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

function baixarPdf(base64: string, nome: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Atividades usadas da última vez por este cliente (só neste navegador). */
function atividadesLembradas(companyId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(`sj-pgdas-atividades:${companyId}`) ?? "[]");
    return Array.isArray(v) ? v.map(String).filter((x) => ATIVIDADES_PGDAS.some((a) => String(a.id) === x && !a.motivo)) : [];
  } catch {
    return [];
  }
}

/**
 * Declarar o Simples Nacional (PGDAS-D) pela Receita, em 3 passos:
 *   1) informa o mês e a receita por atividade;
 *   2) "Simular" — a Receita calcula o imposto (nada é transmitido);
 *   3) "Transmitir" — entrega a declaração, com a conferência de valores da
 *      própria Receita. Depois oferece gerar o DAS do mês.
 */
export function DeclararPgdasCard({
  companies,
  companyId,
  configurado,
}: {
  companies: CompanyOpt[];
  companyId: string;
  configurado: boolean;
}) {
  const meses = mesesEncerrados(13);
  const [pa, setPa] = useState(meses[0].pa);
  const [semMovimento, setSemMovimento] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const lembradas = typeof window === "undefined" ? [] : atividadesLembradas(companyId);
    return lembradas.length ? lembradas.map((id, i) => linhaVazia(i, id)) : [linhaVazia(0)];
  });
  // Municípios já carregados, por UF (ISS devido a outro município).
  const [municipios, setMunicipios] = useState<Record<string, { codigo: string; nome: string }[]>>({});
  const [, startMunicipios] = useTransition();
  // Fator “r”: meses (AAAAMM) de folha que a Receita pediu e o que foi digitado.
  const [mesesFolha, setMesesFolha] = useState<string[]>([]);
  const [folha, setFolha] = useState<Record<string, string>>({});
  const [sim, setSim] = useState<PgdasSimulacao | null>(null);
  const [feito, setFeito] = useState<PgdasTransmissao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [conferi, setConferi] = useState(false);
  const [simulando, startSimular] = useTransition();
  const [transmitindo, startTransmitir] = useTransition();
  const [, startBuscar] = useTransition();
  // Fator “r”: o que a Receita já tem dos 12 meses anteriores (folha e receita).
  const [base, setBase] = useState<{ chave: string; dados: BaseFatorR } | null>(null);
  const [carregandoBase, startBase] = useTransition();

  const empresa = companies.find((c) => c.id === companyId)?.label ?? "";
  const travado = !!feito?.ok || simulando || transmitindo;
  const receita = semMovimento ? 0 : linhas.reduce((s, l) => s + numero(l.valor), 0);
  const receitaExterior = semMovimento
    ? 0
    : linhas
        .filter((l) => atividadePgdas(Number(l.idAtividade))?.exterior)
        .reduce((s, l) => s + numero(l.valor), 0);
  // Cada linha vira uma parcela; só vão os campos que a atividade usa.
  const atividades = semMovimento
    ? []
    : linhas.map((l) => {
        const def = atividadePgdas(Number(l.idAtividade));
        return {
          idAtividade: Number(l.idAtividade),
          valor: numero(l.valor),
          ...(def?.outroMunicipio ? { uf: l.uf, municipio: l.municipio } : {}),
          ...(def?.st
            ? { icms: l.icms ? Number(l.icms) : null, pisCofins: l.pisCofins ? Number(l.pisCofins) : null }
            : {}),
        };
      });
  /** A linha tem tudo o que a atividade dela exige? */
  const linhaCompleta = (l: Linha) => {
    const def = atividadePgdas(Number(l.idAtividade));
    if (!def || numero(l.valor) <= 0) return false;
    if (def.outroMunicipio && !(l.uf && l.municipio)) return false;
    if (def.st && !(l.icms || l.pisCofins)) return false;
    return true;
  };
  const nomeMunicipio = (l: Linha) =>
    (municipios[l.uf] ?? []).find((m) => m.codigo === l.municipio)?.nome ?? l.municipio;
  // Só os meses que a Receita pediu vão junto: valor enviado SUBSTITUI a folha
  // que ela já tem guardada, então nunca mandamos mês em branco por conta própria.
  const temFatorR = !semMovimento && linhas.some((l) => atividadePgdas(Number(l.idAtividade))?.fatorR);
  const pedeFolha = temFatorR && mesesFolha.length > 0;
  const folhas = pedeFolha ? mesesFolha.map((m) => ({ pa: m, valor: numero(folha[m] ?? "") })) : [];
  const pronto =
    (semMovimento || (linhas.length > 0 && linhas.every(linhaCompleta))) &&
    (!pedeFolha || mesesFolha.every((m) => (folha[m] ?? "") !== ""));

  // Quadro dos 12 meses: o que a Receita já tem + o que está sendo informado agora.
  const baseAtual = base?.chave === `${companyId}-${pa}` ? base.dados : null;
  const linhasBase = (baseAtual?.meses ?? []).map((m) => {
    const digitado = pedeFolha && mesesFolha.includes(m.pa) && (folha[m.pa] ?? "") !== "";
    return { ...m, folha: digitado ? numero(folha[m.pa]) : m.folha, agora: digitado };
  });
  /** A Receita não tem folha de nenhum dos 12 meses (cliente nunca declarou fator “r”). */
  const semFolhaNaReceita = (baseAtual?.meses ?? []).every((m) => m.folha == null);
  // Estimativa do fator “r” (folha ÷ receita dos 12 meses) — só com tudo preenchido.
  const estimativa = (() => {
    if (linhasBase.length !== 12 || linhasBase.some((m) => m.folha == null || m.receita == null)) return null;
    const fs = linhasBase.reduce((s, m) => s + (m.folha ?? 0), 0);
    const rb = linhasBase.reduce((s, m) => s + (m.receita ?? 0), 0);
    if (rb <= 0) return null;
    const r = fs / rb;
    return {
      folha: fs,
      receita: rb,
      fator: (Math.floor(r * 100) / 100).toFixed(2).replace(".", ","),
      anexo: r >= 0.28 ? "Anexo III" : "Anexo V",
    };
  })();

  // Pré-preenche a receita com o faturamento já lançado no sistema para o mês
  // (só quando há uma única linha e ela ainda está vazia).
  useEffect(() => {
    startBuscar(async () => {
      const v = await faturamentoDoMes(companyId, pa);
      if (v && v > 0) {
        setLinhas((ls) =>
          ls.length === 1 && ls[0].valor === "" ? [{ ...ls[0], valor: maskCurrency(v.toFixed(2)) }] : ls,
        );
      }
    });
  }, [companyId, pa]);

  /** Qualquer mudança nos dados invalida a simulação anterior. */
  function mudou() {
    setSim(null);
    setErro(null);
  }
  function editarLinha(chave: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));
    // Trocar a atividade muda o que a Receita exige de folha: pergunta de novo.
    if (patch.idAtividade !== undefined) setMesesFolha([]);
    mudou();
  }

  /** Traz da Receita (última declaração) a folha e a receita dos 12 meses. */
  function carregarBase() {
    const chave = `${companyId}-${pa}`;
    if (base?.chave === chave) return;
    startBase(async () => setBase({ chave, dados: await baseFatorR(companyId, pa) }));
  }

  function escolherUf(chave: number, uf: string) {
    editarLinha(chave, { uf, municipio: "" });
    if (uf && !municipios[uf]) {
      startMunicipios(async () => {
        const lista = await municipiosDaUf(uf);
        setMunicipios((m) => ({ ...m, [uf]: lista }));
      });
    }
  }

  function simular() {
    setErro(null);
    setSim(null);
    if (temFatorR) carregarBase();
    startSimular(async () => {
      const r = await simularPgdas({ companyId, pa, atividades, folhas });
      if (!r.ok) {
        // Fator “r”: a Receita diz de quais meses precisa da folha; a tela
        // mostra só esses campos e o contador simula de novo.
        const pedidos = r.mesesFolha ?? [];
        if (pedidos.length > 0) {
          setMesesFolha((atuais) => [...new Set([...atuais, ...pedidos])].sort());
          return;
        }
        setErro(r.erro ?? "Não foi possível simular.");
        return;
      }
      setSim(r);
      try {
        localStorage.setItem(
          `sj-pgdas-atividades:${companyId}`,
          JSON.stringify([...new Set(atividades.map((a) => String(a.idAtividade)))]),
        );
      } catch {
        /* sem armazenamento: só não lembra as atividades */
      }
    });
  }

  function transmitir() {
    if (!sim?.ok || !sim.tipo) return;
    const { tipo, valores } = sim;
    setErro(null);
    startTransmitir(async () => {
      const r = await transmitirPgdas({ companyId, pa, atividades, folhas, tipo, valores: valores ?? [] });
      setConfirmar(false);
      setConferi(false);
      if (!r.ok) {
        setErro(r.erro ?? "A Receita recusou a declaração.");
        setSim(null);
        return;
      }
      setFeito(r);
    });
  }

  if (!configurado) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        A integração com a Receita ainda não está configurada.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ----- 1) Mês e receita por atividade ----- */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="w-full text-sm sm:w-56">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Mês da apuração</span>
          <select
            value={pa}
            disabled={travado}
            onChange={(e) => {
              setPa(e.target.value);
              setMesesFolha([]);
              mudou();
            }}
            className={campo}
          >
            {meses.map((m) => (
              <option key={m.pa} value={m.pa}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={semMovimento}
            disabled={travado}
            onChange={(e) => {
              setSemMovimento(e.target.checked);
              mudou();
            }}
            className="size-4 accent-primary"
          />
          Mês sem movimento (receita zero)
        </label>
      </div>

      {semMovimento ? null : (
        <div className="space-y-2">
          <div className="hidden gap-2 text-xs font-medium text-muted-foreground sm:flex">
            <span className="flex-1">Anexo e atividade (como no PGDAS-D)</span>
            <span className="w-40">Receita do mês (R$)</span>
            <span className="w-9" />
          </div>
          {linhas.map((l) => {
            const def = l.idAtividade ? atividadePgdas(Number(l.idAtividade)) : undefined;
            return (
            <div key={l.chave} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={l.idAtividade}
                disabled={travado}
                onChange={(e) => editarLinha(l.chave, { idAtividade: e.target.value })}
                aria-label="Atividade"
                className={cn(campo, "min-w-0 flex-1 basis-64")}
              >
                <option value="">Escolha o anexo e a atividade…</option>
                {ANEXOS_PGDAS.map((g) => (
                  <optgroup key={g.anexo} label={g.titulo}>
                    {ATIVIDADES_PGDAS.filter((a) => a.anexo === g.anexo).map((a) => (
                      <option
                        key={a.id}
                        value={a.id}
                        // Só pode repetir a atividade que tem dados por parcela
                        // (outro município ou substituição tributária).
                        disabled={
                          !!a.motivo ||
                          (!a.outroMunicipio &&
                            !a.st &&
                            linhas.some((x) => x.chave !== l.chave && x.idAtividade === String(a.id)))
                        }
                      >
                        {a.nome}
                        {a.motivo ? " — só pela Receita" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {def ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary">
                  Anexo {def.anexo}
                  {def.exterior ? " · exterior" : ""}
                </span>
              ) : null}
              <input
                value={l.valor}
                disabled={travado}
                onChange={(e) => editarLinha(l.chave, { valor: maskCurrency(e.target.value) })}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Receita da atividade"
                className={cn(campo, "w-40 text-right tabular-nums")}
              />
              <button
                type="button"
                disabled={travado || linhas.length === 1}
                onClick={() => {
                  setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
                  mudou();
                }}
                aria-label="Remover atividade"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {def?.outroMunicipio ? (
              <div className="flex flex-wrap items-center gap-2 pl-3 text-sm">
                <span className="text-xs text-muted-foreground">ISS devido a</span>
                <select
                  value={l.uf}
                  disabled={travado}
                  onChange={(e) => escolherUf(l.chave, e.target.value)}
                  aria-label="UF do município"
                  className={cn(campo, "w-20")}
                >
                  <option value="">UF</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                <select
                  value={l.municipio}
                  disabled={travado || !l.uf || !municipios[l.uf]}
                  onChange={(e) => editarLinha(l.chave, { municipio: e.target.value })}
                  aria-label="Município onde o ISS é devido"
                  className={cn(campo, "min-w-0 flex-1 basis-48")}
                >
                  <option value="">
                    {!l.uf ? "Escolha a UF primeiro" : municipios[l.uf] ? "Escolha o município…" : "Carregando…"}
                  </option>
                  {(municipios[l.uf] ?? []).map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {def?.st ? (
              <div className="flex flex-wrap items-center gap-2 pl-3 text-sm">
                <select
                  value={l.icms}
                  disabled={travado}
                  onChange={(e) => editarLinha(l.chave, { icms: e.target.value })}
                  aria-label="ICMS desta parte da receita"
                  className={cn(campo, "min-w-0 flex-1 basis-56")}
                >
                  <option value="">ICMS: tributação normal</option>
                  {QUALIF_ICMS.map((q) => (
                    <option key={q.id} value={q.id}>
                      ICMS: {q.nome.toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  value={l.pisCofins}
                  disabled={travado}
                  onChange={(e) => editarLinha(l.chave, { pisCofins: e.target.value })}
                  aria-label="PIS e COFINS desta parte da receita"
                  className={cn(campo, "min-w-0 flex-1 basis-56")}
                >
                  <option value="">PIS/COFINS: tributação normal</option>
                  {QUALIF_PIS_COFINS.map((q) => (
                    <option key={q.id} value={q.id}>
                      PIS/COFINS: {q.nome.toLowerCase()}
                    </option>
                  ))}
                </select>
                {!l.icms && !l.pisCofins ? (
                  <span className="basis-full text-xs text-amber-700 dark:text-amber-400">
                    Marque pelo menos um. Se nada é substituído ou monofásico, use a atividade “sem substituição
                    tributária”.
                  </span>
                ) : null}
              </div>
            ) : null}
            </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={travado}
              onClick={() => {
                setLinhas((ls) => [...ls, linhaVazia(Math.max(...ls.map((x) => x.chave)) + 1)]);
                mudou();
              }}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Plus className="size-3.5" /> Outra atividade ou parcela
            </button>
            <span className="text-sm text-muted-foreground">
              Receita do mês:{" "}
              <strong className="text-foreground tabular-nums">{formatCurrency(receita)}</strong>
              {receitaExterior > 0 ? ` (${formatCurrency(receitaExterior)} do exterior)` : ""}
            </span>
          </div>
        </div>
      )}

      {pedeFolha ? (
        <div className="space-y-2.5 rounded-lg border bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-sm font-semibold">Folha de salários (fator “r”)</p>
            <p className="text-xs text-muted-foreground">
              A Receita pediu a folha {mesesFolha.length === 1 ? "deste mês" : "destes meses"} para calcular o
              fator “r”. Informe o total de cada mês: salários, pró-labore, INSS patronal e FGTS. Os meses que
              não aparecem aqui ela já tem guardados.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mesesFolha.map((m) => (
              <label key={m} className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">{rotuloMes(m)}</span>
                <input
                  value={folha[m] ?? ""}
                  disabled={travado}
                  onChange={(e) => {
                    const v = maskCurrency(e.target.value);
                    setFolha((f) => ({ ...f, [m]: v }));
                    mudou();
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={cn(campo, "text-right tabular-nums")}
                />
              </label>
            ))}
          </div>
          {mesesFolha.length > 1 ? (
            <button
              type="button"
              disabled={travado || !(folha[mesesFolha[0]] ?? "")}
              onClick={() => {
                const v = folha[mesesFolha[0]] ?? "";
                setFolha((f) => ({ ...f, ...Object.fromEntries(mesesFolha.map((m) => [m, v])) }));
                mudou();
              }}
              className="text-[13px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              Repetir o primeiro valor em todos os meses
            </button>
          ) : null}
        </div>
      ) : null}

      {temFatorR && (carregandoBase || baseAtual) ? (
        <details className="rounded-lg border px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium">
            Base do fator “r” — 12 meses anteriores
            {carregandoBase && !baseAtual ? (
              <span className="ml-2 font-normal text-muted-foreground">buscando na Receita…</span>
            ) : estimativa ? (
              <span className="ml-2 font-normal text-muted-foreground">
                folha {formatCurrency(estimativa.folha)} ÷ receita {formatCurrency(estimativa.receita)} ={" "}
                <strong className="text-foreground">{estimativa.fator}</strong> → {estimativa.anexo} (estimativa)
              </span>
            ) : null}
          </summary>
          {baseAtual && !baseAtual.ok ? (
            <p className="mt-2 text-muted-foreground">Não consegui ler a última declaração: {baseAtual.erro}</p>
          ) : baseAtual ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                {!baseAtual.referencia
                  ? "Este cliente ainda não tem declaração transmitida de onde ler."
                  : semFolhaNaReceita
                    ? `A Receita não tem folha guardada deste cliente: as declarações dele (a última é de ${rotuloMes(baseAtual.referencia)}) foram feitas sem fator “r”. Por isso, nesta primeira vez, ela pede todos os meses acima; depois passa a pedir só o mês novo.`
                    : `Lido da declaração de ${rotuloMes(baseAtual.referencia)}, a última transmitida. Os meses com folha já declarada não precisam ser informados de novo.`}{" "}
                O cálculo que vale é o da Receita.
              </p>
              <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {[linhasBase.slice(0, 6), linhasBase.slice(6)].map((bloco, i) => (
                  <div key={i}>
                    <div className="grid grid-cols-[76px_1fr_1fr] gap-2 border-b pb-1 text-xs font-medium text-muted-foreground">
                      <span>Mês</span>
                      <span className="text-right">Folha de salários</span>
                      <span className="text-right">Receita bruta</span>
                    </div>
                    {bloco.map((m) => (
                      <div
                        key={m.pa}
                        className="grid grid-cols-[76px_1fr_1fr] items-baseline gap-2 border-b py-1.5 text-[13px] last:border-b-0"
                      >
                        <span className="whitespace-nowrap text-muted-foreground">{mesCurto(m.pa)}</span>
                        <span className="text-right tabular-nums">
                          {m.folha != null ? formatCurrency(m.folha) : "—"}
                          {m.agora ? <span className="ml-1 text-xs text-primary">agora</span> : null}
                        </span>
                        <span className="text-right text-muted-foreground tabular-nums">
                          {m.receita != null ? formatCurrency(m.receita) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </details>
      ) : null}

      {feito?.ok ? null : (
        <Button type="button" variant={sim?.ok ? "outline" : "default"} disabled={!pronto || travado} onClick={simular}>
          {simulando ? <Loader2 className="animate-spin" /> : <Calculator />}
          {sim?.ok ? "Simular de novo" : "Simular na Receita"}
        </Button>
      )}

      {erro ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      ) : null}

      {/* ----- 2) Cálculo da Receita ----- */}
      {sim?.ok && !feito?.ok ? (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3.5 py-2.5">
            <span className="text-sm font-semibold">Cálculo da Receita · {rotuloMes(pa)}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                sim.tipo === 2
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                  : "bg-primary/10 text-primary",
              )}
            >
              {sim.tipo === 2 ? "Retificadora — este mês já tem declaração" : "Declaração original"}
            </span>
          </div>
          {(sim.valores ?? []).length === 0 ? (
            <p className="border-t px-3.5 py-3 text-sm text-muted-foreground">Sem imposto a pagar neste mês.</p>
          ) : (
            (sim.valores ?? []).map((v) => (
              <div key={v.codigoTributo} className="flex items-center justify-between border-t px-3.5 py-1.5 text-sm">
                <span className="text-muted-foreground">{TRIBUTOS_PGDAS[v.codigoTributo] ?? `Tributo ${v.codigoTributo}`}</span>
                <span className="tabular-nums">{formatCurrency(v.valor)}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between border-t px-3.5 py-2.5 text-sm font-semibold">
            <span>Total do DAS</span>
            <span className="tabular-nums">{formatCurrency(sim.total ?? 0)}</span>
          </div>
          {temFatorR ? (
            <p className="border-t px-3.5 py-2 text-xs text-muted-foreground">
              Fator “r” calculado pela Receita com a folha dos 12 meses anteriores
              {pedeFolha ? " (a que você informou e as que ela já tinha)" : " (as que ela já tem guardadas)"}.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3.5 py-3">
            <span className="text-xs text-muted-foreground">Nada foi transmitido ainda. Confira os valores.</span>
            <Button type="button" disabled={travado} onClick={() => setConfirmar(true)}>
              <Send />
              Transmitir declaração…
            </Button>
          </div>
        </div>
      ) : null}

      {/* ----- 3) Transmitida ----- */}
      {feito?.ok ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="size-4" /> Declaração transmitida
            </p>
            <p className="mt-1 text-emerald-900 dark:text-emerald-200">
              {empresa} · {rotuloMes(pa)} · nº {feito.idDeclaracao}
              {feito.transmitidaEm ? ` · ${dataHora(feito.transmitidaEm)}` : ""} · total{" "}
              {formatCurrency(feito.total ?? 0)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {feito.reciboBase64 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => baixarPdf(feito.reciboBase64!, `PGDAS-D-${pa}-recibo.pdf`)}>
                  <Download /> Recibo
                </Button>
              ) : null}
              {feito.declaracaoBase64 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => baixarPdf(feito.declaracaoBase64!, `PGDAS-D-${pa}-declaracao.pdf`)}>
                  <Download /> Declaração
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-200/80">
              {feito.documentoSalvo
                ? "A declaração foi guardada nos documentos do cliente e o faturamento do mês foi atualizado."
                : "Guarde o recibo e a declaração."}
            </p>
          </div>
          {feito.maedBase64 || feito.darfMaedBase64 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" /> A Receita gerou multa por atraso na entrega (MAED)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {feito.maedBase64 ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => baixarPdf(feito.maedBase64!, `PGDAS-D-${pa}-notificacao-multa.pdf`)}>
                    <Download /> Notificação
                  </Button>
                ) : null}
                {feito.darfMaedBase64 ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => baixarPdf(feito.darfMaedBase64!, `PGDAS-D-${pa}-darf-multa.pdf`)}>
                    <Download /> DARF da multa
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {feito.aviso ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              {feito.aviso}
            </p>
          ) : null}
          {feito.das?.publicado ? (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>{feito.das.titulo}.</strong> {feito.das.detalhe}
              </span>
            </p>
          ) : (feito.total ?? 0) > 0 ? (
            <div className="rounded-lg border bg-muted/20 px-3.5 py-4">
              <p className="text-sm font-semibold">
                {feito.das ? feito.das.titulo : "Retificadora: o DAS não é publicado sozinho"}
              </p>
              <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
                {feito.das
                  ? `${feito.das.detalhe} A declaração já está entregue; gere o DAS por aqui:`
                  : "Confira se este mês já tem DAS pago. Se precisar de uma guia nova, gere e publique por aqui:"}
              </p>
              <EmitirDasCard companies={companies} configurado={configurado} bare semIntro clienteFixo={companyId} periodoInicial={pa} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem imposto a pagar neste mês — não há DAS para gerar.</p>
          )}
        </div>
      ) : null}

      {/* ----- Confirmação da transmissão ----- */}
      <Dialog
        open={confirmar}
        onOpenChange={(v) => {
          if (transmitindo) return;
          setConfirmar(v);
          if (!v) setConferi(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transmitir a declaração à Receita?</DialogTitle>
            <DialogDescription>
              A declaração é uma confissão de dívida e será entregue em nome do cliente. Depois de
              transmitida, só dá para corrigir com uma retificadora.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg border text-sm">
            <div className="flex justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground">Cliente</span>
              <span className="text-right font-medium">{empresa}</span>
            </div>
            <div className="flex justify-between gap-3 border-t px-3 py-2">
              <span className="text-muted-foreground">Mês</span>
              <span className="font-medium">{rotuloMes(pa)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t px-3 py-2">
              <span className="text-muted-foreground">Tipo</span>
              <span className={cn("font-medium", sim?.tipo === 2 && "text-amber-700 dark:text-amber-400")}>
                {sim?.tipo === 2 ? "Retificadora" : "Original"}
              </span>
            </div>
            {atividades.length === 0 ? (
              <div className="flex justify-between gap-3 border-t px-3 py-2">
                <span className="text-muted-foreground">Receita</span>
                <span className="font-medium">Sem movimento</span>
              </div>
            ) : (
              linhas.map((l) => {
                const def = atividadePgdas(Number(l.idAtividade));
                const extras = [
                  def?.outroMunicipio ? `ISS devido a ${nomeMunicipio(l)}/${l.uf}` : null,
                  def?.st && l.icms ? `ICMS: ${nomeQualificacao(QUALIF_ICMS, Number(l.icms))?.toLowerCase()}` : null,
                  def?.st && l.pisCofins
                    ? `PIS/COFINS: ${nomeQualificacao(QUALIF_PIS_COFINS, Number(l.pisCofins))?.toLowerCase()}`
                    : null,
                ].filter(Boolean);
                return (
                  <div key={l.chave} className="flex justify-between gap-3 border-t px-3 py-2">
                    <span className="min-w-0 text-muted-foreground">
                      {nomeAtividadePgdas(Number(l.idAtividade))}
                      {extras.length ? <span className="block text-xs text-foreground">{extras.join(" · ")}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatCurrency(numero(l.valor))}</span>
                  </div>
                );
              })
            )}
            {folhas.map((f) => (
              <div key={f.pa} className="flex justify-between gap-3 border-t px-3 py-2">
                <span className="text-muted-foreground">Folha de {rotuloMes(f.pa)}</span>
                <span className="font-medium tabular-nums">{formatCurrency(f.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t bg-muted/40 px-3 py-2 font-semibold">
              <span>Total do DAS</span>
              <span className="tabular-nums">{formatCurrency(sim?.total ?? 0)}</span>
            </div>
          </div>
          {(sim?.total ?? 0) > 0 ? (
            <p className="text-xs text-muted-foreground">
              {sim?.tipo === 2
                ? "Por ser retificadora, o DAS não é publicado sozinho: você decide depois de transmitir."
                : "Ao transmitir, o DAS do mês é gerado e publicado no portal do cliente, e ele recebe o aviso."}
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={conferi}
              onChange={(e) => setConferi(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            Conferi o mês, as atividades e os valores.
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={transmitindo} />}>
              Cancelar
            </DialogClose>
            <Button type="button" disabled={!conferi || transmitindo} onClick={transmitir}>
              {transmitindo ? <Loader2 className="animate-spin" /> : <Send />}
              Transmitir agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
