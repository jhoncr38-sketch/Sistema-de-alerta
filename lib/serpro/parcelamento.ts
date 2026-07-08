import { chamarServico } from "@/lib/serpro/client";

/**
 * Emissão de guias de PARCELAMENTO via Integra Contador.
 *
 * Vários sistemas de parcelamento seguem o MESMO trio de serviços, mudando só o
 * idSistema: PARCSN (Simples), PARCMEI (MEI), PERTSN, RELPSN, etc.
 *   • PARCELASPARAGERAR162 (Consultar) — lista parcelas a emitir, com valor;
 *   • GERARDAS161 (Emitir) — gera o DAS de uma parcela (AAAAMM). PDF em
 *     `docArrecadacaoPdfB64`.
 * O valor JÁ vem na consulta, então dá para publicar como boleto sem digitar.
 *
 * Testado contra a Receita real (PARCSN). Só fala com a Receita e normaliza.
 */

/**
 * Sistemas de parcelamento suportados. Os idServico foram CONFIRMADOS na
 * documentação do SERPRO (não chutados). PARCSN testado ponta a ponta; os
 * demais seguem o mesmo padrão de serviços.
 */
export const PARCELAMENTO_SISTEMAS = [
  { id: "PARCSN", label: "Parcelamento do Simples (PARCSN)" },
  { id: "PARCMEI", label: "Parcelamento do MEI (PARCMEI)" },
  { id: "PERTSN", label: "PERT do Simples (PERTSN)" },
  { id: "RELPSN", label: "RELP do Simples (RELPSN)" },
] as const;

// Serviços por sistema — idServico confirmados na doc (cenários de trial).
const SERVICOS: Record<string, { listar: string; emitir: string }> = {
  PARCSN: { listar: "PARCELASPARAGERAR162", emitir: "GERARDAS161" },
  PARCMEI: { listar: "PARCELASPARAGERAR202", emitir: "GERARDAS201" },
  PERTSN: { listar: "PARCELASPARAGERAR182", emitir: "GERARDAS181" },
  RELPSN: { listar: "PARCELASPARAGERAR192", emitir: "GERARDAS191" },
};

export interface ParcelaDisponivel {
  /** Competência no formato AAAAMM (número). */
  parcela: number;
  valor: number | null;
}

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
function parseMensagens(body: unknown): { codigo: string; texto: string }[] {
  const b = (typeof body === "object" ? body : {}) as Record<string, unknown>;
  return Array.isArray(b.mensagens)
    ? (b.mensagens as { codigo: string; texto: string }[])
    : [];
}

export interface ParcelasResultado {
  ok: boolean;
  parcelas: ParcelaDisponivel[];
  erro?: string;
}

/** Lista as parcelas disponíveis para emissão de um contribuinte. */
export async function listarParcelas(params: {
  sistema: string;
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
}): Promise<ParcelasResultado> {
  const svc = SERVICOS[params.sistema];
  if (!svc) return { ok: false, parcelas: [], erro: "Sistema não suportado." };

  const res = await chamarServico("Consultar", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: params.sistema,
    idServico: svc.listar,
    versaoSistema: "1.0",
    dados: "",
  });
  const msgs = parseMensagens(res.body);
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      parcelas: [],
      erro:
        msgs.map((m) => m.texto).join(" ") ||
        `A Receita recusou (HTTP ${res.status}).`,
    };
  }
  const d = parseDados(res.body);
  const lista = (d.listaParcelas ?? d.parcelas ?? []) as Record<
    string,
    unknown
  >[];
  const parcelas: ParcelaDisponivel[] = lista.map((p) => ({
    parcela: Number(p.parcela ?? p.anoMes ?? 0),
    valor: p.valor != null ? Number(p.valor) : null,
  }));
  return { ok: true, parcelas };
}

export interface EmitirParcelaResultado {
  ok: boolean;
  pdfBase64?: string;
  erro?: string;
}

/** Emite o DAS de UMA parcela (AAAAMM). Retorna o PDF (base64). */
export async function emitirParcela(params: {
  sistema: string;
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  parcela: number; // AAAAMM
}): Promise<EmitirParcelaResultado> {
  const svc = SERVICOS[params.sistema];
  if (!svc) return { ok: false, erro: "Sistema não suportado." };

  const res = await chamarServico("Emitir", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: params.sistema,
    idServico: svc.emitir,
    versaoSistema: "1.0",
    dados: { parcelaParaEmitir: params.parcela },
  });
  const msgs = parseMensagens(res.body);
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      erro:
        msgs.map((m) => m.texto).join(" ") ||
        `A Receita recusou (HTTP ${res.status}).`,
    };
  }
  const d = parseDados(res.body);
  const pdf =
    (d.docArrecadacaoPdfB64 as string | undefined) ??
    (d.docArrecadacaoPdf as string | undefined) ??
    (d.pdf as string | undefined);
  if (!pdf) {
    return {
      ok: false,
      erro:
        msgs.map((m) => m.texto).join(" ") ||
        "A Receita não retornou a guia da parcela.",
    };
  }
  return { ok: true, pdfBase64: pdf };
}
