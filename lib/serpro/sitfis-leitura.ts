import { extractText, getDocumentProxy } from "unpdf";
import { ORIGEM_ESOCIAL, ORIGEM_MIT } from "@/lib/serpro/origem";

/**
 * Leitura do Relatório de Situação Fiscal (SITFIS) — a fonte oficial dos
 * débitos em aberto do contribuinte. Extrai o TEXTO do PDF (unpdf, sem IA) e
 * lê as tabelas de forma exata. Formato de uma linha de débito (SIEF):
 *
 *   SIMPLES NAC. 05/2026 22/06/2026 1.307,47 1.307,47 261,49 57,39 1.626,35 DEVEDOR
 *   Receita      PA      Dt. Vcto   Vl.Orig  Sdo.Dev  Multa  Juros Sdo.Cons  Situação
 *
 * O PA pode ser mês (05/2026), ano (2025), trimestre ("2º TRIM/2026" — que o
 * PDF quebra em 2 linhas) ou data (lançamento de multa, ex.: MAED). As seções
 * vêm em linhas "Título ______". Débitos ficam em "Pendência - Débito";
 * omissões em "Omissão de ..."; o resto volta como texto para o contador ler.
 */


export interface DebitoSitfis {
  /** Como aparece no relatório: "SIMPLES NAC.", "MEI", "2089-01 - IRPJ"... */
  receita: string;
  /** Tipo para a ação na tela. */
  tipo: "simples" | "mei" | "outro";
  /** Como no relatório: "05/2026", "2º TRIM/2026", "2025" ou uma data. */
  pa: string;
  /** "YYYY-MM-DD". */
  vencimento: string;
  valorOriginal: number;
  saldoDevedor: number;
  multa: number;
  juros: number;
  /** Saldo consolidado (com multa e juros) — o que o cliente pagaria hoje. */
  saldoConsolidado: number;
  situacao: string;
  /** "AAAAMM" do PA mensal (DAS do Simples). null nos demais. */
  periodoMensal: string | null;
  /** "AAAAMM" da declaração DCTFWeb onde o débito está (trimestre → último
   *  mês do trimestre). null quando não vem da DCTFWeb (ex.: lançamento). */
  periodoDctf: string | null;
  /** Sistema de origem para filtrar o DARF da DCTFWeb (MIT ou eSocial). */
  origem: number | null;
  /** Lançamento de ofício/multa (pago pela notificação, não pela DCTFWeb). */
  lancamento: boolean;
  /** Ex.: "Notificação de lançamento: 6992355335088". */
  obs: string | null;
}

export interface SecaoTexto {
  titulo: string;
  linhas: string[];
}

export interface LeituraSitfis {
  /** Débitos em "Pendência - Débito". */
  debitos: DebitoSitfis[];
  /** Débitos de outras seções de tabela. */
  outrosDebitos: (DebitoSitfis & { secao: string })[];
  /** "Omissão de PGDAS-D: 2026 - AGO". */
  omissoes: string[];
  /** Demais pendências da Receita (parcelamento em atraso, suspensos...). */
  outras: SecaoTexto[];
  /** Parte da PGFN: sem pendências, ou as seções do relatório. */
  pgfn: { semPendencias: boolean; secoes: SecaoTexto[] };
}

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;
const PA = String.raw`(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}|\d[º°o]\s*TRIM\/\d{4}|\d{4})`;
const RE_DEBITO = new RegExp(
  String.raw`^(.+?)\s+${PA}\s+(\d{2}\/\d{2}\/\d{4})\s+` +
    `${VALOR}\\s+${VALOR}\\s+${VALOR}\\s+${VALOR}\\s+${VALOR}\\s+(.+)$`,
);
/** Linha de título de seção: texto seguido (ou cercado) de "____". */
const RE_SECAO = /^_*\s*([^_]+?)\s*_{5,}\s*$/;
/** Cabeçalho repetido no topo de cada página (não muda a seção). */
const RE_CABECALHO =
  /^(MINISTÉRIO DA ECONOMIA|SECRETARIA ESPECIAL DA RECEITA|PROCURADORIA-GERAL DA FAZENDA NACIONAL \d|INFORMAÇÕES DE APOIO|CNPJ: \d{2}\.\d{3}\.\d{3}(\/\d{4}-\d{2})?( - .*)?$|Página: |Receita PA\/Exerc\.)/;

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

function tipoDaReceita(receita: string): DebitoSitfis["tipo"] {
  const r = receita.toUpperCase();
  if (r.startsWith("SIMPLES NAC")) return "simples";
  if (r === "MEI" || r.startsWith("MEI ")) return "mei";
  return "outro";
}

/** De qual sistema a receita vem na DCTFWeb (para o filtro do DARF). */
function origemDaReceita(receita: string): number | null {
  const r = receita.toUpperCase();
  if (/\bCP[-\s.]|PREVID|SEGUR|PATRONAL|TERCEIROS|RAT\b|GILRAT/.test(r)) return ORIGEM_ESOCIAL;
  if (/IRPJ|CSLL|\bPIS\b|COFINS|\bIPI\b|\bIOF\b|CIDE/.test(r)) return ORIGEM_MIT;
  return null;
}

/** Períodos derivados do PA: mensal (DAS) e o mês da declaração DCTFWeb. */
function periodos(pa: string): { mensal: string | null; dctf: string | null; lancamento: boolean } {
  let m = pa.match(/^(\d{2})\/(\d{4})$/);
  if (m) return { mensal: `${m[2]}${m[1]}`, dctf: `${m[2]}${m[1]}`, lancamento: false };
  m = pa.match(/^(\d)[º°o]\s*TRIM\/(\d{4})$/);
  if (m) {
    const mes = String(Number(m[1]) * 3).padStart(2, "0"); // 2º TRIM -> junho
    return { mensal: null, dctf: `${m[2]}${mes}`, lancamento: false };
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(pa)) return { mensal: null, dctf: null, lancamento: true };
  return { mensal: null, dctf: null, lancamento: false }; // exercício anual
}

/**
 * Junta linhas que o PDF quebrou no meio de um débito (ex.: "2089-01 - IRPJ 2º"
 * + "TRIM/2026 31/07/2026 1.226,29 ..."): se a linha sozinha não é débito mas
 * junto com a próxima é, vira uma só.
 */
function juntarQuebras(linhas: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const atual = linhas[i];
    const prox = linhas[i + 1];
    // Só junta se NENHUMA das duas é débito sozinha (senão uma linha comum —
    // ex.: "Notificação de lançamento" — grudaria no débito seguinte).
    if (
      prox !== undefined &&
      !RE_DEBITO.test(atual) &&
      !RE_DEBITO.test(prox) &&
      RE_DEBITO.test(`${atual} ${prox}`)
    ) {
      out.push(`${atual} ${prox}`);
      i++;
    } else {
      out.push(atual);
    }
  }
  return out;
}

/** Extrai o texto (todas as páginas, linhas na ordem) do PDF em base64. */
export async function textoDoPdf(pdfBase64: string): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(pdfBase64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function adicionarLinha(secoes: SecaoTexto[], titulo: string, linha: string) {
  let bloco = secoes.find((o) => o.titulo === titulo);
  if (!bloco) {
    bloco = { titulo, linhas: [] };
    secoes.push(bloco);
  }
  // Número sozinho (ex.: quantidade de parcelas em atraso) completa a linha
  // anterior: "MEI - EM PARCELAMENTO Parcelas em atraso: 4".
  if (/^\d+$/.test(linha) && bloco.linhas.length > 0) {
    bloco.linhas[bloco.linhas.length - 1] += `: ${linha}`;
  } else {
    bloco.linhas.push(linha);
  }
}

/** Lê o texto do SITFIS e separa débitos, omissões e demais pendências. */
export function lerSitfis(texto: string): LeituraSitfis {
  const out: LeituraSitfis = {
    debitos: [],
    outrosDebitos: [],
    omissoes: [],
    outras: [],
    pgfn: { semPendencias: false, secoes: [] },
  };
  let secao = "";
  let naPgfn = false;
  let naReceita = false;
  let ultimoDebito: DebitoSitfis | null = null;

  const linhas = juntarQuebras(
    texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^_+$/.test(l) && !RE_CABECALHO.test(l)),
  );

  for (const linha of linhas) {
    const s = linha.match(RE_SECAO);
    if (s) {
      const titulo = s[1].trim();
      if (/Diagnóstico Fiscal na Receita Federal/i.test(titulo)) {
        naReceita = true;
        naPgfn = false;
        secao = "";
      } else if (/Diagnóstico Fiscal na Procuradoria/i.test(titulo)) {
        naPgfn = true;
        naReceita = false;
        secao = "";
      } else {
        secao = titulo;
      }
      ultimoDebito = null;
      continue;
    }
    if (/^Final do Relatório/i.test(linha)) break;

    if (naPgfn) {
      if (/Não foram detectadas pendências/i.test(linha)) out.pgfn.semPendencias = true;
      else adicionarLinha(out.pgfn.secoes, secao || "Procuradoria", linha);
      continue;
    }
    if (!naReceita || !secao) continue;

    const d = linha.match(RE_DEBITO);
    if (d) {
      const [dia, mes, ano] = d[3].split("/");
      const receita = d[1].trim();
      const pa = d[2].replace(/\s+/g, " ").replace("°", "º");
      const per = periodos(pa);
      const debito: DebitoSitfis = {
        receita,
        tipo: tipoDaReceita(receita),
        pa,
        vencimento: `${ano}-${mes}-${dia}`,
        valorOriginal: num(d[4]),
        saldoDevedor: num(d[5]),
        multa: num(d[6]),
        juros: num(d[7]),
        saldoConsolidado: num(d[8]),
        situacao: d[9].trim(),
        periodoMensal: per.mensal,
        periodoDctf: per.lancamento ? null : per.dctf,
        origem: origemDaReceita(receita),
        lancamento: per.lancamento,
        obs: null,
      };
      if (/^Pendência - Débito/i.test(secao)) out.debitos.push(debito);
      else out.outrosDebitos.push({ ...debito, secao });
      ultimoDebito = debito;
      continue;
    }

    // "Notificação de lançamento: N" logo depois de um débito é dele.
    if (/^Notificação de lançamento/i.test(linha) && ultimoDebito) {
      ultimoDebito.obs = linha;
      ultimoDebito.lancamento = true;
      ultimoDebito.periodoDctf = null;
      continue;
    }

    if (/^Omissão/i.test(secao)) {
      const periodo = linha.replace(/^\(Período de Apuração\)\s*/i, "");
      out.omissoes.push(`${secao}: ${periodo}`);
      continue;
    }

    adicionarLinha(out.outras, secao, linha);
  }
  return out;
}
