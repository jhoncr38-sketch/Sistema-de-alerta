import { chamarServico } from "@/lib/serpro/client";

/**
 * DCTFWeb — geração do DARF (documento de arrecadação) via Integra Contador.
 *
 * O DARF da DCTFWeb engloba os tributos federais apurados no período (INSS, PIS,
 * COFINS, IRPJ, CSLL, conforme a apuração). Serviço GERARGUIA31 (ação Emitir).
 *
 * Diferente do DAS: o retorno traz SÓ o PDF (campo `PDFByteArrayBase64`), sem
 * valor/vencimento estruturados. Por isso, na hora de publicar como boleto, o
 * contador confere o PDF e informa valor e vencimento manualmente.
 */

/** Categorias de apuração da DCTFWeb (as mais usadas). */
export const DCTFWEB_CATEGORIAS = [
  { valor: "GERAL_MENSAL", label: "Geral — mensal" },
  { valor: "13_SALARIO", label: "13º salário" },
  { valor: "GERAL_ESPECIAL", label: "Espetáculo desportivo / especial" },
  { valor: "AFERICAO", label: "Aferição de obra" },
  { valor: "RECLAMATORIA", label: "Reclamatória trabalhista" },
] as const;

export interface DarfResultado {
  ok: boolean;
  /** PDF do DARF em base64 (quando ok). */
  pdfBase64?: string;
  erro?: string;
  mensagens: { codigo: string; texto: string }[];
}

/**
 * Gera o DARF da DCTFWeb de um contribuinte para uma categoria + período.
 * Retorna só o PDF (a Receita não devolve valor/vencimento aqui).
 */
export async function gerarDarfDctfweb(params: {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  categoria: string;
  anoPA: string; // AAAA
  mesPA: string; // MM
}): Promise<DarfResultado> {
  const res = await chamarServico("Emitir", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: "DCTFWEB",
    idServico: "GERARGUIA31",
    versaoSistema: "1.0",
    dados: {
      categoria: params.categoria,
      anoPA: params.anoPA,
      mesPA: params.mesPA,
    },
  });

  const body = (typeof res.body === "object" ? res.body : {}) as Record<
    string,
    unknown
  >;
  const mensagens = Array.isArray(body.mensagens)
    ? (body.mensagens as { codigo: string; texto: string }[])
    : [];

  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      erro:
        mensagens.map((m) => m.texto).join(" ") ||
        `A Receita recusou (HTTP ${res.status}).`,
      mensagens,
    };
  }

  // `dados` é string JSON; o PDF vem em PDFByteArrayBase64 (não em `pdf`).
  let dados: Record<string, unknown> = {};
  try {
    dados =
      typeof body.dados === "string"
        ? (JSON.parse(body.dados || "{}") as Record<string, unknown>)
        : ((body.dados as Record<string, unknown>) ?? {});
  } catch {
    dados = {};
  }
  const pdf =
    (dados.PDFByteArrayBase64 as string | undefined) ??
    (dados.pdf as string | undefined);
  if (!pdf) {
    return {
      ok: false,
      erro:
        mensagens.map((m) => m.texto).join(" ") ||
        "A Receita não retornou o DARF (talvez não haja apuração para o período).",
      mensagens,
    };
  }
  return { ok: true, pdfBase64: pdf, mensagens };
}
