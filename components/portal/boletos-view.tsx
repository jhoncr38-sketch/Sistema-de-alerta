"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Download,
  ListFilter,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { requestBoletoReissue } from "@/app/actions/documents";
import { ComprovanteButton } from "@/components/comprovante-button";
import { MapaAno, type EstadoMes } from "@/components/portal/mapa-ano";
import {
  BaixarGuiaAcao,
  JaPagueiAcao,
  PedirSegundaViaAcao,
} from "@/components/portal/acoes-guia";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/format";
import { SITUACAO_COR, mesAnoLabel, mesNome, type Situacao } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** Boleto pronto para a tela (o servidor já calculou situação e textos). */
export interface BoletoLinha {
  id: string;
  nome: string;
  competencia: string | null;
  valor: number | null;
  situacao: Situacao;
  /** Complemento da situação: "20/08, há 44 dias" / "18/09". */
  detalhe: string;
  /** Texto da coluna de ações em "Com o contador" ("2ª via pedida 03/10"). */
  nota: string | null;
  exigeComprovante: boolean;
  temArquivo: boolean;
  temComprovante: boolean;
  comprovanteNome: string | null;
  vencKey: string | null; // "YYYY-MM" do vencimento
  pagoKey: string | null; // "YYYY-MM" do pagamento (ou do vencimento)
  compKey: string | null; // "YYYY-MM" da competência
  dueDate: string | null;
  pagoEm: string | null;
}

type Aba = "aberto" | "pagos" | "todos";
type Agrupar = "vencimento" | "competencia";

const somaValor = (ls: BoletoLinha[]) => ls.reduce((s, l) => s + (l.valor ?? 0), 0);

/** Sem acento e minúsculo, para a busca. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Linhas que entram na seleção múltipla (as que pedem ação do cliente). */
const selecionavel = (l: BoletoLinha) =>
  l.situacao === "precisa" || l.situacao === "a_pagar";

function SituacaoTexto({ l }: { l: BoletoLinha }) {
  const cor = SITUACAO_COR[l.situacao];
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <span className={cn("size-[7px] shrink-0 rounded-full", cor.dot)} />
      <span className={cn("shrink-0 font-medium", cor.text)}>{cor.label}</span>
      {l.detalhe ? (
        <span className="truncate text-muted-foreground">· {l.detalhe}</span>
      ) : null}
    </span>
  );
}

/** Ações da linha no desktop (coluna da direita). */
function AcoesDesktop({ l }: { l: BoletoLinha }) {
  if (l.situacao === "contador") {
    return <span className="text-xs text-muted-foreground">{l.nota}</span>;
  }
  if (l.situacao === "pago") {
    return (
      <>
        <ComprovanteButton
          docId={l.id}
          paid
          hasComprovante={l.temComprovante}
          fileName={l.comprovanteNome}
          labelAnexar="Anexar"
        />
        {l.temArquivo ? (
          <a
            href={`/api/documents/${l.id}/download`}
            title="Baixar boleto"
            aria-label="Baixar boleto"
            className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="size-4" />
          </a>
        ) : null}
      </>
    );
  }
  return (
    <>
      <JaPagueiAcao docId={l.id} exigeComprovante={l.exigeComprovante} variante="icon" />
      {l.situacao === "precisa" ? (
        <PedirSegundaViaAcao docId={l.id} tamanho="sm" />
      ) : l.temArquivo ? (
        <BaixarGuiaAcao docId={l.id} tamanho="sm" />
      ) : null}
    </>
  );
}

/** Ação da linha no celular (link de texto + clipe). */
function AcoesCelular({ l }: { l: BoletoLinha }) {
  if (l.situacao === "contador") return null;
  if (l.situacao === "pago") {
    return (
      <ComprovanteButton
        docId={l.id}
        paid
        hasComprovante={l.temComprovante}
        fileName={l.comprovanteNome}
      />
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      <JaPagueiAcao docId={l.id} exigeComprovante={l.exigeComprovante} variante="icon" />
      {l.situacao === "precisa" ? (
        <PedirSegundaViaAcao docId={l.id} tamanho="text" />
      ) : l.temArquivo ? (
        <BaixarGuiaAcao docId={l.id} tamanho="text" />
      ) : null}
    </span>
  );
}

/**
 * Meus boletos (redesenho 9c): abas Em aberto / Pagos / Todos, busca, ano,
 * mapa do ano, tabela única agrupada por mês e seleção múltipla.
 */
export function BoletosView({
  linhas,
  abaInicial,
  mesAtual,
}: {
  linhas: BoletoLinha[];
  abaInicial: Aba;
  /** "YYYY-MM" de hoje (fuso do Brasil), calculado no servidor. */
  mesAtual: string;
}) {
  const anoAtual = Number(mesAtual.slice(0, 4));
  const [aba, setAbaState] = useState<Aba>(abaInicial);
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | null>(null);
  const [agrupar, setAgrupar] = useState<Agrupar>("vencimento");
  const [semComprovante, setSemComprovante] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pedindo, startPedido] = useTransition();

  function setAba(a: Aba) {
    setAbaState(a);
    setMes(null);
    setSelecionados(new Set());
    setSemComprovante(false);
    // Estado na URL (?tab=), sem recarregar a página.
    const url = new URL(window.location.href);
    if (a === "aberto") url.searchParams.delete("tab");
    else url.searchParams.set("tab", a);
    window.history.replaceState(null, "", url);
  }

  // ----- Totais das abas -----
  const abertos = linhas.filter((l) => l.situacao !== "pago");
  const pagos = linhas.filter((l) => l.situacao === "pago");
  const aPagarTotal = somaValor(abertos.filter(selecionavel));
  const comContador = abertos.filter((l) => l.situacao === "contador");
  const pagosSemComprovante = pagos.filter((l) => !l.temComprovante);

  // Data que posiciona o boleto no calendário: pagamento (aba Pagos) ou vencimento.
  const dataKey = (l: BoletoLinha) => (aba === "pagos" ? l.pagoKey : l.vencKey);

  const anos = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    for (const l of linhas) {
      for (const k of [l.vencKey, l.pagoKey]) if (k) s.add(Number(k.slice(0, 4)));
    }
    return [...s].sort((a, b) => b - a);
  }, [linhas, anoAtual]);

  // ----- Mapa do ano (por vencimento) -----
  const estados: EstadoMes[] = Array.from({ length: 12 }, (_, i) => {
    const key = `${ano}-${String(i + 1).padStart(2, "0")}`;
    if (key > mesAtual) return "vazio";
    const doMes = linhas.filter((l) => l.vencKey === key);
    if (doMes.some((l) => l.situacao === "precisa")) return "pendente";
    if (key === mesAtual) return "corrente";
    if (doMes.length > 0 && doMes.every((l) => l.situacao === "pago")) return "pago";
    return doMes.length > 0 ? "corrente" : "vazio";
  });
  const pagoNoAno = somaValor(
    pagos.filter((l) => l.pagoKey?.startsWith(String(ano))),
  );

  // ----- Filtros -----
  const termo = normalizar(busca.trim());
  const visiveis = linhas.filter((l) => {
    if (aba === "aberto" && l.situacao === "pago") return false;
    if (aba === "pagos" && l.situacao !== "pago") return false;
    const k = dataKey(l);
    // "Em aberto" mostra tudo que falta, de qualquer ano; as outras abas, o ano.
    if (aba !== "aberto" && !k?.startsWith(String(ano))) return false;
    if (mes !== null && k !== `${ano}-${String(mes).padStart(2, "0")}`) return false;
    if (aba === "pagos" && semComprovante && l.temComprovante) return false;
    if (termo) {
      const alvo = normalizar(`${l.nome} ${l.competencia ?? ""}`);
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  // ----- Grupos por mês -----
  const grupoKey = (l: BoletoLinha) =>
    agrupar === "competencia" ? l.compKey : dataKey(l);
  const grupos = new Map<string, BoletoLinha[]>();
  for (const l of visiveis) {
    const k = grupoKey(l) ?? "sem-data";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }
  const gruposOrdenados = [...grupos.entries()]
    .sort(([a], [b]) => (a === "sem-data" ? 1 : b === "sem-data" ? -1 : a < b ? 1 : -1))
    .map(([k, ls]) => ({
      key: k,
      linhas: [...ls].sort((a, b) =>
        aba === "pagos"
          ? (b.pagoEm ?? "").localeCompare(a.pagoEm ?? "")
          : (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
      ),
    }));

  function tituloGrupo(k: string): string {
    if (k === "sem-data") return "Sem data";
    const [y, m] = k.split("-").map(Number);
    if (agrupar === "competencia") return `Competência ${String(m).padStart(2, "0")}/${y}`;
    if (aba === "pagos") return mesAnoLabel(k);
    const sufixo = y !== anoAtual ? ` de ${y}` : "";
    return `${k < mesAtual ? "Venceram em" : "Vencem em"} ${mesNome(m)}${sufixo}`;
  }

  // ----- Seleção múltipla -----
  const podeSelecionar = aba !== "pagos";
  const selecionadasLinhas = linhas.filter((l) => selecionados.has(l.id));
  const totalSelecionado = somaValor(selecionadasLinhas);
  const vencidasSelecionadas = selecionadasLinhas.filter((l) => l.situacao === "precisa");
  const baixaveis = selecionadasLinhas.filter((l) => l.temArquivo);
  const selecionaveisVisiveis = visiveis.filter(selecionavel);
  const todosMarcados =
    selecionaveisVisiveis.length > 0 &&
    selecionaveisVisiveis.every((l) => selecionados.has(l.id));

  function alternar(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function pedirSegundasVias() {
    startPedido(async () => {
      let ok = 0;
      for (const l of vencidasSelecionadas) {
        try {
          await requestBoletoReissue(l.id);
          ok++;
        } catch {
          /* segue para os próximos */
        }
      }
      if (ok > 0) {
        toast.success(
          ok === 1 ? "2ª via pedida ao contador." : `${ok} pedidos de 2ª via enviados.`,
        );
      } else {
        toast.error("Não foi possível pedir agora.");
      }
      setSelecionados(new Set());
    });
  }

  const colunas = podeSelecionar
    ? "md:grid-cols-[16px_minmax(0,1fr)_210px_110px_170px]"
    : "md:grid-cols-[minmax(0,1fr)_210px_110px_170px]";

  const abaBotao = (a: Aba, rotulo: string, extra: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={aba === a}
      onClick={() => setAba(a)}
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none",
        aba === a ? "bg-card font-semibold shadow-sm" : "text-foreground/80 hover:text-foreground",
      )}
    >
      {rotulo}
      <span className="hidden font-medium text-muted-foreground tabular-nums sm:inline">
        {extra}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ----- Barra superior ----- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          className="flex w-full rounded-lg bg-muted p-[3px] sm:w-auto"
        >
          {abaBotao("aberto", "Em aberto", formatCurrency(aPagarTotal))}
          {abaBotao("pagos", "Pagos", String(pagos.length))}
          {abaBotao("todos", "Todos", String(linhas.length))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aba === "pagos" && pagosSemComprovante.length > 0 ? (
            <button
              type="button"
              aria-pressed={semComprovante}
              onClick={() => setSemComprovante((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium ring-1 transition-colors",
                semComprovante
                  ? "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
                  : "text-muted-foreground ring-border hover:text-foreground",
              )}
            >
              <Paperclip className="size-3.5" />
              Sem comprovante {pagosSemComprovante.length}
              {semComprovante ? <X className="size-3.5" /> : null}
            </button>
          ) : null}
          <label className="relative">
            <span className="sr-only">Buscar por tipo ou competência</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              className="h-8 w-[160px] rounded-lg border bg-card pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[200px]"
            />
          </label>
          <select
            aria-label="Ano"
            value={ano}
            onChange={(e) => {
              setAno(Number(e.target.value));
              setMes(null);
            }}
            className="h-8 rounded-lg border bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger
              title="Agrupar por"
              aria-label="Agrupar por"
              className="hidden size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <ListFilter className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={agrupar}
                  onValueChange={(v) => setAgrupar(v as Agrupar)}
                >
                  <DropdownMenuRadioItem value="vencimento">
                    {aba === "pagos" ? "Data do pagamento" : "Vencimento"}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="competencia">
                    Competência
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ----- Mapa do ano ----- */}
      <MapaAno
        rotulo={`Pago em ${ano}`}
        valor={formatCurrency(pagoNoAno)}
        estados={estados}
        selecionado={mes}
        onSelecionar={setMes}
        legenda={[
          { estado: "pago", texto: "Tudo pago" },
          { estado: "pendente", texto: "Em aberto" },
          { estado: "vazio", texto: "A vir" },
        ]}
      />

      {/* ----- Tabela ----- */}
      {visiveis.length === 0 ? (
        <div className="rounded-[10px] border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {aba === "aberto" && !termo && mes === null
            ? "Tudo em dia! Você não tem boletos em aberto."
            : "Nenhum boleto encontrado com esses filtros."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border bg-card">
          <div
            className={cn(
              "hidden h-[34px] items-center gap-3.5 px-3.5 text-xs text-neutral-400 md:grid",
              colunas,
            )}
          >
            {podeSelecionar ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={todosMarcados}
                aria-label="Selecionar todos"
                disabled={selecionaveisVisiveis.length === 0}
                onClick={() =>
                  setSelecionados(
                    todosMarcados
                      ? new Set()
                      : new Set(selecionaveisVisiveis.map((l) => l.id)),
                  )
                }
                className={cn(
                  "flex size-4 items-center justify-center rounded border disabled:opacity-40",
                  todosMarcados
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-neutral-300 bg-card dark:border-neutral-600",
                )}
              >
                {todosMarcados ? <Check className="size-3" /> : null}
              </button>
            ) : null}
            <span>Guia</span>
            <span>Situação</span>
            <span className="text-right">Valor</span>
            <span />
          </div>

          {gruposOrdenados.map((g) => {
            const semComp = g.linhas.filter((l) => !l.temComprovante).length;
            return (
              <div key={g.key}>
                <div className="flex h-[30px] items-center justify-between gap-3 border-t bg-neutral-50 px-3.5 text-xs text-muted-foreground first:border-t-0 md:first:border-t dark:bg-muted/40">
                  <span className="font-semibold tracking-wide uppercase">
                    {tituloGrupo(g.key)}
                  </span>
                  <span className="tabular-nums">
                    {aba === "pagos" && semComprovante
                      ? `${semComp} sem comprovante`
                      : formatCurrency(somaValor(g.linhas))}
                  </span>
                </div>

                {g.linhas.map((l) => {
                  const marcado = selecionados.has(l.id);
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "border-t px-3.5 py-2.5 md:grid md:h-[46px] md:items-center md:gap-3.5 md:py-0",
                        colunas,
                        marcado && "bg-primary/5",
                      )}
                    >
                      {podeSelecionar ? (
                        <span className="hidden md:flex">
                          {selecionavel(l) ? (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={marcado}
                              aria-label={`Selecionar ${l.nome}`}
                              onClick={() => alternar(l.id)}
                              className={cn(
                                "flex size-4 items-center justify-center rounded border",
                                marcado
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-neutral-300 bg-card dark:border-neutral-600",
                              )}
                            >
                              {marcado ? <Check className="size-3" /> : null}
                            </button>
                          ) : null}
                        </span>
                      ) : null}

                      {/* Nome (+ valor no celular) */}
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-sm font-semibold">{l.nome}</span>
                          {l.competencia ? (
                            <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                              {l.competencia}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums md:hidden">
                          {l.valor != null ? formatCurrency(l.valor) : "—"}
                        </span>
                      </div>

                      {/* Situação (+ ação no celular) */}
                      <div className="mt-1 flex min-w-0 items-center justify-between gap-3 md:mt-0">
                        <SituacaoTexto l={l} />
                        <span className="md:hidden">
                          <AcoesCelular l={l} />
                        </span>
                      </div>

                      <span className="hidden text-right text-sm font-semibold tabular-nums md:block">
                        {l.valor != null ? formatCurrency(l.valor) : "—"}
                      </span>

                      <div className="hidden items-center justify-end gap-2 md:flex">
                        <AcoesDesktop l={l} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ----- Rodapé ----- */}
      {aba === "aberto" && abertos.length > 0 ? (
        <p className="text-xs text-muted-foreground md:hidden">
          A pagar {formatCurrency(aPagarTotal)}
          {comContador.length > 0
            ? ` · com o contador ${formatCurrency(somaValor(comContador))}`
            : ""}
        </p>
      ) : null}
      {aba === "aberto" && comContador.length > 0 ? (
        <p className="hidden text-xs text-muted-foreground md:block">
          Mais {formatCurrency(somaValor(comContador))} com o contador ·{" "}
          <Paperclip className="inline size-3 align-[-1px]" /> = já paguei
        </p>
      ) : aba === "aberto" && abertos.length > 0 ? (
        <p className="hidden text-xs text-muted-foreground md:block">
          <Paperclip className="inline size-3 align-[-1px]" /> = já paguei
        </p>
      ) : null}
      {aba === "pagos" && semComprovante ? (
        <p className="text-xs text-amber-800 dark:text-amber-400">
          Seu contador precisa destes comprovantes para fechar a contabilidade.
        </p>
      ) : null}

      {/* ----- Barra de seleção (desktop) ----- */}
      {podeSelecionar && selecionados.size > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[13px] text-background shadow-[0_12px_30px_rgba(0,0,0,.2)] md:left-[calc(50%+120px)] md:flex">
          <span className="mr-2 tabular-nums">
            <strong>{selecionados.size}</strong> · {formatCurrency(totalSelecionado)}
          </span>
          {baixaveis.length > 0 ? (
            <a
              href={`/api/documents/zip?nome=boletos&ids=${baixaveis.map((l) => l.id).join(",")}`}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-neutral-800 px-2.5 text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              <Download className="size-3.5" />
              Baixar
            </a>
          ) : null}
          {vencidasSelecionadas.length > 0 ? (
            <button
              type="button"
              disabled={pedindo}
              onClick={pedirSegundasVias}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-neutral-800 px-2.5 text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {pedindo ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              2ª via
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={() => setSelecionados(new Set())}
            className="ml-1 inline-flex size-[30px] items-center justify-center rounded-[7px] hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
