import { chamarServico } from "@/lib/serpro/client";
import { atividadePgdas } from "@/lib/serpro/pgdas-atividades";
import { lerDeclaracaoPgdas, type DeclaracaoLida } from "@/lib/serpro/pgdas-leitura";
import { textoDoPdf } from "@/lib/serpro/sitfis-leitura";

/**
 * Declaração mensal do Simples Nacional (PGDAS-D / TRANSDECLARACAO11) via
 * Integra Contador.
 *
 * Dois modos, pelo `transmitir`:
 *   • false → SIMULAÇÃO: a Receita só calcula e devolve os valores devidos por
 *     tributo. Nada é transmitido nem gravado.
 *   • true  → TRANSMISSÃO: entrega a declaração (confissão de dívida). Vai com
 *     `indicadorComparacao` ligado e os valores da simulação: se o cálculo da
 *     Receita diferir em 1 centavo, ela recusa e nada é transmitido.
 *
 * Cobre: regime de competência, um estabelecimento (sem filiais) e todas as
 * atividades da tabela (lib/serpro/pgdas-atividades.ts), incluindo substituição
 * tributária/monofásica, ISS devido a outro município, exterior e fator “r”.
 * Sem atividades = declaração sem movimento. Fora: filiais e regime de caixa.
 */

/**
 * Uma PARCELA de receita de uma atividade. A mesma atividade pode aparecer em
 * mais de uma parcela (ex.: ISS devido a municípios diferentes, ou parte com
 * ST de ICMS e parte monofásica) — elas são agrupadas no envio.
 */
export interface AtividadeDeclarada {
  idAtividade: number;
  valor: number;
  /** ISS devido a outro município: código TOM/SIAFI (4 dígitos) e UF. */
  municipio?: string;
  uf?: string;
  /** Substituição tributária / monofásica / antecipação, por tributo. */
  qualificacoes?: { codigoTributo: number; id: number }[];
}

export interface ValorDevido {
  codigoTributo: number;
  valor: number;
}

/** Folha de salários de um mês (fator “r”). `pa` = AAAAMM. */
export interface FolhaMes {
  pa: string;
  valor: number;
}

export interface PgdasEntrada {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  /** Período de apuração AAAAMM. */
  pa: string;
  /** 1 = original, 2 = retificadora. */
  tipo: 1 | 2;
  /** Vazio = sem movimento (receita zero). */
  atividades: AtividadeDeclarada[];
  /** Folha dos meses anteriores — só quando há atividade com fator “r”. */
  folhas?: FolhaMes[];
  transmitir: boolean;
  /** Valores da simulação — obrigatórios para transmitir quando há imposto. */
  valoresParaComparacao?: ValorDevido[];
}

export interface PgdasResultado {
  ok: boolean;
  status: number;
  /** Mensagem da Receita quando recusa (ou erro de leitura). */
  erro?: string;
  /** Código da mensagem, ex.: "MSG_ISN_041". */
  codigoErro?: string;
  /** Meses (AAAAMM) de folha que a Receita exige (MSG_ISN_029, fator “r”). */
  mesesFolha?: string[];
  valoresDevidos: ValorDevido[];
  total: number;
  /** Só na transmissão. */
  idDeclaracao: string | null;
  /** AAAAMMDDHHmmSS, só na transmissão. */
  dataHoraTransmissao: string | null;
  declaracaoPdf: string | null;
  reciboPdf: string | null;
  /** Multa por atraso (MAED): notificação e DARF, quando houver. */
  maedPdf: string | null;
  darfMaedPdf: string | null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

function vazio(status: number, extra: Partial<PgdasResultado>): PgdasResultado {
  return {
    ok: false,
    status,
    valoresDevidos: [],
    total: 0,
    idDeclaracao: null,
    dataHoraTransmissao: null,
    declaracaoPdf: null,
    reciboPdf: null,
    maedPdf: null,
    darfMaedPdf: null,
    ...extra,
  };
}

/** Texto e código das mensagens que a Receita devolve no corpo. */
function mensagens(body: unknown): { texto: string; codigo?: string } {
  const lista = (body as { mensagens?: { codigo?: string; texto?: string }[] } | null)?.mensagens;
  if (!Array.isArray(lista) || lista.length === 0) {
    return { texto: typeof body === "string" ? body.slice(0, 500) : "" };
  }
  const texto = lista.map((m) => m.texto ?? "").filter(Boolean).join(" ");
  const codigo = lista.map((m) => m.codigo ?? "").join(" ").match(/MSG_[A-Z0-9_]+/)?.[0];
  return { texto, codigo };
}

/** "… Informar o(s) período(s): 09/2025, 10/2025 e 06/2026." → ["202509", …] */
function mesesPedidos(texto: string): string[] {
  const depois = texto.split(/per[ií]odo\(s\)\s*:/i)[1] ?? texto;
  return [...depois.matchAll(/(\d{2})\/(\d{4})/g)].map((m) => `${m[2]}${m[1]}`);
}

/** Um PDF pode vir como string base64 ou como { pdf }. */
function pdfDe(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  const p = (v as { pdf?: unknown } | null)?.pdf;
  return typeof p === "string" && p.length > 0 ? p : null;
}

interface Ids {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
}

/**
 * Declarações transmitidas num ano (CONSDECLARACAO13): período (AAAAMM) → números
 * das declarações (original e retificadoras). null = não deu para consultar.
 */
async function declaracoesDoAno(ids: Ids, ano: string): Promise<Map<string, string[]> | null> {
  const res = await chamarServico("Consultar", {
    contratanteCpfCnpj: ids.contratanteCnpj,
    autorCpfCnpj: ids.autorCnpj,
    contribuinteCpfCnpj: ids.contribuinteCnpj,
    idSistema: "PGDASD",
    idServico: "CONSDECLARACAO13",
    dados: { anoCalendario: ano },
  });
  if (res.status < 200 || res.status >= 300) return null;
  const mapa = new Map<string, string[]>();
  let dados: unknown = (res.body as { dados?: unknown } | null)?.dados;
  if (typeof dados === "string") {
    if (!dados.trim()) return mapa; // ano sem nenhuma declaração
    try {
      dados = JSON.parse(dados);
    } catch {
      return null;
    }
  }
  const periodos = (dados as { periodos?: unknown } | null)?.periodos;
  if (!Array.isArray(periodos)) return mapa;
  for (const p of periodos as { periodoApuracao?: unknown; operacoes?: unknown }[]) {
    const ops = Array.isArray(p.operacoes)
      ? (p.operacoes as { indiceDeclaracao?: { numeroDeclaracao?: unknown } | null }[])
      : [];
    const numeros = ops
      .map((o) => (o.indiceDeclaracao?.numeroDeclaracao ? String(o.indiceDeclaracao.numeroDeclaracao) : ""))
      .filter(Boolean);
    if (numeros.length) mapa.set(String(p.periodoApuracao), numeros);
  }
  return mapa;
}

/**
 * O período já tem declaração transmitida?
 * true → a próxima é retificadora. null = não deu para saber.
 */
export async function periodoJaDeclarado(params: Ids & { pa: string }): Promise<boolean | null> {
  const mapa = await declaracoesDoAno(params, params.pa.slice(0, 4));
  return mapa ? mapa.has(params.pa) : null;
}

/**
 * Lê a declaração mais recente transmitida ANTES do período `pa` (olha o ano do
 * PA e, se preciso, o anterior): é de onde vêm a folha e as receitas que a
 * Receita já tem guardadas. null = cliente sem declaração anterior (ou falha).
 */
export async function ultimaDeclaracaoAntesDe(params: Ids & { pa: string }): Promise<DeclaracaoLida | null> {
  const ano = Number(params.pa.slice(0, 4));
  let alvo: { pa: string; numero: string } | null = null;
  for (const a of [ano, ano - 1]) {
    const mapa = await declaracoesDoAno(params, String(a));
    if (!mapa) return null;
    const anteriores = [...mapa.keys()].filter((k) => k < params.pa).sort();
    const ultimo = anteriores.at(-1);
    if (ultimo) {
      // A de maior número é a mais recente (…001 original, …002 retificadora).
      alvo = { pa: ultimo, numero: [...mapa.get(ultimo)!].sort().at(-1)! };
      break;
    }
  }
  if (!alvo) return null;

  const res = await chamarServico("Consultar", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: "PGDASD",
    idServico: "CONSDECREC15",
    dados: { numeroDeclaracao: alvo.numero },
  });
  if (res.status < 200 || res.status >= 300) return null;
  let dados: unknown = (res.body as { dados?: unknown } | null)?.dados;
  if (typeof dados === "string") {
    try {
      dados = JSON.parse(dados);
    } catch {
      return null;
    }
  }
  const pdf = pdfDe((dados as { declaracao?: unknown } | null)?.declaracao);
  if (!pdf) return null;
  const lida = lerDeclaracaoPgdas(await textoDoPdf(pdf));
  return { ...lida, pa: lida.pa ?? alvo.pa };
}

/** Simula (transmitir=false) ou transmite (true) a declaração do período. */
export async function declararPgdas(e: PgdasEntrada): Promise<PgdasResultado> {
  const cnpj = e.contribuinteCnpj.replace(/\D/g, "");
  const parcelas = e.atividades.map((a) => ({ ...a, valor: centavos(a.valor) }));
  const soma = (l: { valor: number }[]) => centavos(l.reduce((s, a) => s + a.valor, 0));
  // Receita do exterior vai separada da do mercado interno.
  const doExterior = (id: number) => !!atividadePgdas(id)?.exterior;
  const receitaExterna = soma(parcelas.filter((a) => doExterior(a.idAtividade)));
  const receitaInterna = soma(parcelas.filter((a) => !doExterior(a.idAtividade)));
  const receita = centavos(receitaInterna + receitaExterna);
  // Parcelas da mesma atividade vão juntas (a Receita não aceita a atividade repetida).
  const porAtividade = new Map<number, typeof parcelas>();
  for (const a of parcelas) porAtividade.set(a.idAtividade, [...(porAtividade.get(a.idAtividade) ?? []), a]);
  const comparar = (e.valoresParaComparacao ?? []).filter((v) => v.valor > 0);

  // Transmitir sem os valores da simulação só é aceito quando não há imposto.
  if (e.transmitir && receita > 0 && comparar.length === 0) {
    return vazio(0, { erro: "Simule antes de transmitir: faltam os valores para a conferência da Receita." });
  }

  const dados = {
    cnpjCompleto: cnpj,
    pa: Number(e.pa),
    indicadorTransmissao: e.transmitir,
    indicadorComparacao: e.transmitir && comparar.length > 0,
    declaracao: {
      tipoDeclaracao: e.tipo,
      receitaPaCompetenciaInterno: receitaInterna,
      receitaPaCompetenciaExterno: receitaExterna,
      ...(e.folhas && e.folhas.length > 0
        ? { folhasSalario: e.folhas.map((f) => ({ pa: Number(f.pa), valor: centavos(f.valor) })) }
        : {}),
      estabelecimentos: [
        parcelas.length > 0
          ? {
              cnpjCompleto: cnpj,
              atividades: [...porAtividade].map(([idAtividade, ps]) => ({
                idAtividade,
                valorAtividade: soma(ps),
                receitasAtividade: ps.map((a) => ({
                  valor: a.valor,
                  ...(a.municipio ? { codigoOutroMunicipio: a.municipio, outraUf: a.uf } : {}),
                  ...(a.qualificacoes && a.qualificacoes.length > 0
                    ? { qualificacoesTributarias: a.qualificacoes }
                    : {}),
                })),
              })),
            }
          : { cnpjCompleto: cnpj },
      ],
    },
    ...(e.transmitir && comparar.length > 0
      ? { valoresParaComparacao: comparar.map((v) => ({ codigoTributo: v.codigoTributo, valor: centavos(v.valor) })) }
      : {}),
  };

  const res = await chamarServico("Declarar", {
    contratanteCpfCnpj: e.contratanteCnpj,
    autorCpfCnpj: e.autorCnpj,
    contribuinteCpfCnpj: cnpj,
    idSistema: "PGDASD",
    idServico: "TRANSDECLARACAO11",
    dados,
  });

  const msg = mensagens(res.body);
  if (res.status < 200 || res.status >= 300) {
    return vazio(res.status, {
      erro: msg.texto || `A Receita recusou (HTTP ${res.status}).`,
      codigoErro: msg.codigo,
      // Fator “r”: a própria Receita diz de quais meses precisa da folha.
      ...(msg.codigo === "MSG_ISN_029" ? { mesesFolha: mesesPedidos(msg.texto) } : {}),
    });
  }

  let d: unknown = (res.body as { dados?: unknown } | null)?.dados;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return vazio(res.status, { erro: "A Receita respondeu num formato inesperado." });
    }
  }
  if (Array.isArray(d)) d = d[0];
  const o = (d ?? {}) as {
    idDeclaracao?: unknown;
    dataHoraTransmissao?: unknown;
    valoresDevidos?: unknown;
    declaracao?: unknown;
    recibo?: unknown;
    notificacaoMaed?: unknown;
    darf?: unknown;
  };
  const valoresDevidos: ValorDevido[] = Array.isArray(o.valoresDevidos)
    ? (o.valoresDevidos as { codigoTributo?: unknown; valor?: unknown }[])
        .map((v) => ({ codigoTributo: Number(v.codigoTributo), valor: centavos(Number(v.valor)) }))
        .filter((v) => Number.isFinite(v.codigoTributo) && Number.isFinite(v.valor))
    : [];
  const idDeclaracao = o.idDeclaracao ? String(o.idDeclaracao) : null;

  // Pediu para transmitir e a Receita não devolveu o número da declaração:
  // trata como falha (não dá para afirmar que foi entregue).
  if (e.transmitir && !idDeclaracao) {
    return vazio(res.status, {
      erro: msg.texto || "A Receita não confirmou a transmissão (sem número de declaração).",
      codigoErro: msg.codigo,
      valoresDevidos,
    });
  }

  return {
    ok: true,
    status: res.status,
    valoresDevidos,
    total: centavos(valoresDevidos.reduce((s, v) => s + v.valor, 0)),
    idDeclaracao,
    dataHoraTransmissao: o.dataHoraTransmissao ? String(o.dataHoraTransmissao) : null,
    declaracaoPdf: pdfDe(o.declaracao),
    reciboPdf: pdfDe(o.recibo),
    maedPdf: pdfDe(o.notificacaoMaed),
    darfMaedPdf: pdfDe(o.darf),
  };
}
