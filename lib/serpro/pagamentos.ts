import { chamarServico } from "@/lib/serpro/client";
import { lerPagamentos, type PagamentoReceita } from "@/lib/pagamentos-casar";

/**
 * Pagamentos na Receita via Integra Contador (Integra-Pagamento / PAGTOWEB):
 *   • PAGAMENTOS71 (Consultar) — lista os documentos de arrecadação PAGOS do
 *     contribuinte (DAS, DARF...), com número, data de arrecadação e valor;
 *   • COMPARRECADACAO72 (Emitir) — o comprovante de arrecadação em PDF.
 *
 * Só fala com a Receita e normaliza o retorno — quem decide o que fazer com
 * cada pagamento é lib/pagamentos-receita.ts.
 */

const SISTEMA = "PAGTOWEB";
/** Máximo da Receita por página. */
const TAMANHO_PAGINA = 100;
/** Trava de segurança: no máximo 500 pagamentos por consulta. */
const MAX_PAGINAS = 5;

type Mensagem = { codigo: string; texto: string };

function corpo(body: unknown): Record<string, unknown> {
  return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
}

function mensagens(body: unknown): Mensagem[] {
  const m = corpo(body).mensagens;
  return Array.isArray(m) ? (m as Mensagem[]) : [];
}

export type ConsultaPagamentos =
  | { ok: true; pagamentos: PagamentoReceita[] }
  | { ok: false; status: number; erro: string; raw: string };

/**
 * Pagamentos do contribuinte com data de arrecadação no intervalo (YYYY-MM-DD).
 * Pagina de 100 em 100 até acabar.
 */
export async function consultarPagamentos(params: {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  dataInicial: string;
  dataFinal: string;
}): Promise<ConsultaPagamentos> {
  const vistos = new Map<string, PagamentoReceita>();

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const res = await chamarServico("Consultar", {
      contratanteCpfCnpj: params.contratanteCnpj,
      autorCpfCnpj: params.autorCnpj,
      contribuinteCpfCnpj: params.contribuinteCnpj,
      idSistema: SISTEMA,
      idServico: "PAGAMENTOS71",
      versaoSistema: "1.0",
      dados: {
        intervaloDataArrecadacao: {
          dataInicial: params.dataInicial,
          dataFinal: params.dataFinal,
        },
        primeiroDaPagina: pagina * TAMANHO_PAGINA,
        tamanhoDaPagina: TAMANHO_PAGINA,
      },
    });

    // Sem pagamentos no período: alguns serviços respondem 204.
    if (res.status === 204) break;
    if (res.status < 200 || res.status >= 300) {
      const raw = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      return {
        ok: false,
        status: res.status,
        erro:
          mensagens(res.body).map((m) => m.texto).join(" ") ||
          `A Receita recusou a consulta de pagamentos (HTTP ${res.status}).`,
        raw: raw.slice(0, 2000),
      };
    }

    const lista = lerPagamentos(corpo(res.body).dados);
    for (const p of lista) vistos.set(p.numeroDocumento, p);
    if (lista.length < TAMANHO_PAGINA) break;
  }

  return { ok: true, pagamentos: [...vistos.values()] };
}

/** O PDF vem em base64 — "JVBER" é o começo de "%PDF" codificado. */
function acharPdf(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("JVBER")) return s;
    try {
      return acharPdf(JSON.parse(s));
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = acharPdf(x);
      if (p) return p;
    }
    return null;
  }
  if (v && typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const p = acharPdf(x);
      if (p) return p;
    }
  }
  return null;
}

export type ComprovanteResultado =
  | { ok: true; pdfBase64: string }
  | { ok: false; erro: string };

/** Comprovante de arrecadação (PDF, base64) de um documento pago. */
export async function emitirComprovante(params: {
  contratanteCnpj: string;
  autorCnpj: string;
  contribuinteCnpj: string;
  numeroDocumento: string;
}): Promise<ComprovanteResultado> {
  const res = await chamarServico("Emitir", {
    contratanteCpfCnpj: params.contratanteCnpj,
    autorCpfCnpj: params.autorCnpj,
    contribuinteCpfCnpj: params.contribuinteCnpj,
    idSistema: SISTEMA,
    idServico: "COMPARRECADACAO72",
    versaoSistema: "1.0",
    dados: { numeroDocumento: params.numeroDocumento },
  });
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      erro:
        mensagens(res.body).map((m) => m.texto).join(" ") ||
        `A Receita recusou o comprovante (HTTP ${res.status}).`,
    };
  }
  const pdf = acharPdf(corpo(res.body).dados);
  return pdf ? { ok: true, pdfBase64: pdf } : { ok: false, erro: "A Receita não devolveu o PDF do comprovante." };
}
