import { chamarServico } from "@/lib/serpro/client";

/**
 * Relatório de Situação Fiscal (SITFIS) via Integra Contador.
 *
 * É um fluxo de DUAS etapas, assíncrono:
 *   1) SOLICITARPROTOCOLO91 (ação Apoiar) → devolve `protocoloRelatorio` e um
 *      `tempoEspera` (ms) sugerido antes de buscar o resultado;
 *   2) RELATORIOSITFIS92 (ação Emitir) com o protocolo → devolve o PDF (base64).
 *      Pode ainda estar processando (503 / sem pdf); tentamos algumas vezes.
 *
 * versaoSistema é "2.0" (a "1.0" foi descontinuada). Só fala com a Receita e
 * devolve o PDF — não decide publicar.
 */

const VERSAO = "2.0";
const MAX_TENTATIVAS = 5;
const ESPERA_PADRAO = 3000;

export interface SitfisResultado {
  ok: boolean;
  /** PDF do relatório de situação fiscal em base64 (quando ok). */
  pdfBase64?: string;
  erro?: string;
  mensagens: { codigo: string; texto: string }[];
}

function parseMensagens(body: unknown): { codigo: string; texto: string }[] {
  const b = (typeof body === "object" ? body : {}) as Record<string, unknown>;
  return Array.isArray(b.mensagens)
    ? (b.mensagens as { codigo: string; texto: string }[])
    : [];
}

/** Extrai o objeto `dados` (string JSON no corpo) de forma tolerante. */
function parseDados(body: unknown): Record<string, unknown> {
  const b = (typeof body === "object" ? body : {}) as Record<string, unknown>;
  try {
    return typeof b.dados === "string"
      ? (JSON.parse(b.dados || "{}") as Record<string, unknown>)
      : ((b.dados as Record<string, unknown>) ?? {});
  } catch {
    return {};
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Emite o relatório de situação fiscal de um contribuinte. Faz as duas etapas e
 * aguarda o processamento. Retorna o PDF (base64) ou um erro amigável.
 */
export async function consultarSituacaoFiscal(params: {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
}): Promise<SitfisResultado> {
  // Etapa 1 — solicita o protocolo.
  const r1 = await chamarServico("Apoiar", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: "SITFIS",
    idServico: "SOLICITARPROTOCOLO91",
    versaoSistema: VERSAO,
    dados: "", // este serviço exige dados vazio
  });
  const msgs1 = parseMensagens(r1.body);
  if (r1.status < 200 || r1.status >= 300) {
    return {
      ok: false,
      erro:
        msgs1.map((m) => m.texto).join(" ") ||
        `A Receita recusou a solicitação (HTTP ${r1.status}).`,
      mensagens: msgs1,
    };
  }
  const d1 = parseDados(r1.body);
  const protocolo = d1.protocoloRelatorio as string | undefined;
  if (!protocolo) {
    return {
      ok: false,
      erro:
        msgs1.map((m) => m.texto).join(" ") ||
        "A Receita não devolveu o protocolo do relatório.",
      mensagens: msgs1,
    };
  }
  const espera = Math.min(Number(d1.tempoEspera) || ESPERA_PADRAO, 9000);
  await sleep(espera);

  // Etapa 2 — busca o relatório, tentando algumas vezes se ainda processa.
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const r2 = await chamarServico("Emitir", {
      contratanteCpfCnpj: params.contratanteCnpj,
      autorCpfCnpj: params.autorCnpj,
      contribuinteCpfCnpj: params.contribuinteCnpj,
      idSistema: "SITFIS",
      idServico: "RELATORIOSITFIS92",
      versaoSistema: VERSAO,
      dados: { protocoloRelatorio: protocolo },
    });
    const msgs2 = parseMensagens(r2.body);
    const d2 = parseDados(r2.body);
    const pdf = d2.pdf as string | undefined;
    if (pdf) {
      return { ok: true, pdfBase64: pdf, mensagens: msgs2 };
    }
    // 503 ou sem pdf = ainda processando; aguarda e tenta de novo.
    if (i < MAX_TENTATIVAS - 1) {
      await sleep(ESPERA_PADRAO);
    } else {
      return {
        ok: false,
        erro:
          msgs2.map((m) => m.texto).join(" ") ||
          "O relatório ainda estava sendo processado. Tente de novo em instantes.",
        mensagens: msgs2,
      };
    }
  }
  return { ok: false, erro: "Não foi possível obter o relatório.", mensagens: [] };
}
