import { chamarServico } from "@/lib/serpro/client";

/**
 * Emissão de DAS do Simples Nacional (PGDASD / GERARDAS12) via Integra Contador.
 *
 * Recebe o período de apuração (YYYYMM) e o CNPJ do contribuinte; devolve o PDF
 * do DAS (base64) e, quando o SERPRO informa, valor e vencimento. Este módulo só
 * FALA com a Receita e normaliza o retorno — quem decide publicar é a camada de
 * cima (a Fatia de emissão sempre passa pela conferência do contador).
 */

export interface DasEmitido {
  /** PDF do DAS em base64 (pronto para virar arquivo/anexo). */
  pdfBase64: string;
  /** Valor total do DAS, se o retorno informar (em reais). */
  valor: number | null;
  /** Vencimento no formato ISO (YYYY-MM-DD), se informado. */
  vencimento: string | null;
  /** Número do documento / DAS, se informado. */
  numeroDocumento: string | null;
  /** Mensagens de negócio da Receita (avisos/sucesso). */
  mensagens: { codigo: string; texto: string }[];
}

export interface DasResultado {
  ok: boolean;
  status: number;
  das?: DasEmitido;
  /** Mensagem de erro amigável quando ok=false. */
  erro?: string;
  /** Corpo bruto para diagnóstico. */
  raw: string;
}

/** Converte "YYYY-MM-DD" ou "DD/MM/YYYY" (ou nº) num ISO; null se não der. */
function normalizarData(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  // YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

/**
 * Extrai valor/vencimento/número do DAS. O GERARDAS12 traz um objeto
 * `detalhamentoDas` com `numeroDocumento`, `dataVencimento` (YYYYMMDD),
 * `dataLimiteAcolhimento` e `valores.total`.
 */
function extrairCampos(dados: Record<string, unknown>): {
  valor: number | null;
  vencimento: string | null;
  numeroDocumento: string | null;
} {
  const det = (dados.detalhamentoDas ?? dados) as Record<string, unknown>;

  const valores = (det.valores ?? {}) as Record<string, unknown>;
  const valorRaw =
    valores.total ?? valores.principal ?? det.valorTotalDocumento ?? null;
  const valor =
    valorRaw == null
      ? null
      : typeof valorRaw === "number"
        ? valorRaw
        : Number(String(valorRaw).replace(/\./g, "").replace(",", ".")) || null;

  // Prefere o vencimento; na falta, o limite de acolhimento.
  const vencimento = normalizarData(
    det.dataVencimento ?? det.dataLimiteAcolhimento ?? null,
  );

  const num = det.numeroDocumento ?? det.numeroDas ?? null;

  return {
    valor,
    vencimento,
    numeroDocumento: num == null ? null : String(num),
  };
}

/**
 * Gera o DAS de um contribuinte para um período (YYYYMM). Não publica nada —
 * apenas retorna o PDF e os dados normalizados para conferência.
 */
export async function gerarDas(params: {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  periodoApuracao: string; // YYYYMM
}): Promise<DasResultado> {
  const res = await chamarServico("Emitir", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: "PGDASD",
    idServico: "GERARDAS12",
    dados: { periodoApuracao: params.periodoApuracao },
  });

  const raw =
    typeof res.body === "string"
      ? res.body
      : JSON.stringify(res.body, null, 2);

  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      status: res.status,
      erro: `A Receita recusou (HTTP ${res.status}). Veja o detalhe.`,
      raw: raw.slice(0, 4000),
    };
  }

  // O corpo do SERPRO tem "dados" como STRING JSON — precisa de 2º parse. E no
  // GERARDAS12 esse JSON é um ARRAY: [{ pdf, detalhamento... }]. Normalizamos
  // para o 1º elemento (ou o próprio objeto, se algum serviço não usar array).
  const body = (typeof res.body === "object" ? res.body : {}) as Record<
    string,
    unknown
  >;
  let dados: Record<string, unknown> = {};
  try {
    const parsed =
      typeof body.dados === "string"
        ? JSON.parse(body.dados || "{}")
        : (body.dados ?? {});
    dados = (Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed) as Record<
      string,
      unknown
    >;
  } catch {
    dados = {};
  }

  const mensagens = Array.isArray(body.mensagens)
    ? (body.mensagens as { codigo: string; texto: string }[])
    : [];

  const pdfBase64 = typeof dados.pdf === "string" ? dados.pdf : "";
  if (!pdfBase64) {
    return {
      ok: false,
      status: res.status,
      erro:
        mensagens.map((m) => m.texto).join(" ") ||
        "A Receita não retornou o PDF do DAS (talvez não haja apuração para o período).",
      raw: raw.slice(0, 4000),
    };
  }

  const campos = extrairCampos(dados);
  return {
    ok: true,
    status: res.status,
    das: { pdfBase64, ...campos, mensagens },
    raw: raw.slice(0, 2000),
  };
}
