/**
 * Leitura de guia por IA para o ENVIO EM LOTE: além de CNPJ, valor e
 * vencimento, identifica o TIPO da guia e a COMPETÊNCIA. Usada também pelo
 * "Ler com IA" do envio manual.
 * A IA lê o PDF direto (gpt-4o-mini com input de arquivo) e NÃO inventa —
 * campos incertos voltam null e o contador confere na tela antes de publicar.
 * Fail-open: retorna null se a IA não estiver configurada ou falhar.
 */

import type { DocType } from "@/lib/types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const TIMEOUT_MS = 40_000;

/** Tipos de guia a pagar que a IA pode escolher (mesmos do envio avulso). */
export const TIPOS_GUIA: readonly DocType[] = [
  "das",
  "darf_irpj",
  "darf_piscofins",
  "darf_csll",
  "gps_inss",
  "iss",
  "iss_rpa",
  "icms",
  "fgts",
  "mensalidade",
  "outro",
];

export interface GuiaLida {
  /** CNPJ (14) ou CPF (11) do contribuinte, só dígitos. */
  documento: string | null;
  /** TODOS os CNPJ/CPF (e raízes de 8 dígitos) que aparecem no PDF — reserva
   *  para achar o cliente quando o "documento" principal vier errado/nulo. */
  documentos: string[];
  tipo: DocType | null;
  /** Descrição curta quando tipo = "outro". */
  descricao: string | null;
  /** "MM/AAAA". */
  competencia: string | null;
  valor: number | null;
  /** "YYYY-MM-DD". */
  vencimento: string | null;
}

const SYSTEM = `Você extrai dados de guias de pagamento brasileiras (DAS do Simples Nacional, DARF, GPS/INSS, FGTS, ISS, ICMS, boletos de mensalidade). Responda SOMENTE um objeto JSON, sem texto extra e sem markdown:
{"documento":"<CNPJ ou CPF do contribuinte, só dígitos, ou null>","documentos":["<todos os CNPJ, CPF ou raízes de CNPJ de 8 dígitos que aparecem no documento, só dígitos>"],"tipo":"<código>","descricao":"<texto curto ou null>","competencia":"<MM/AAAA ou null>","valor":<número ou null>,"vencimento":"<YYYY-MM-DD ou null>"}
Códigos de "tipo":
- das = DAS / Documento de Arrecadação do Simples Nacional (inclui DAS-MEI)
- darf_irpj = DARF de IRPJ (códigos 2089, 0220, 3373...)
- darf_piscofins = DARF de PIS ou COFINS (8109, 2172, 6912, 5856...)
- darf_csll = DARF de CSLL (2372, 6012, 2484...)
- gps_inss = GPS, INSS, DARF previdenciário ou DARF da DCTFWeb
- fgts = FGTS / GFD / Guia do FGTS Digital
- iss = ISS / ISSQN municipal da empresa
- iss_rpa = ISS retido de autônomo (RPA)
- icms = ICMS / DAE / GARE estadual
- mensalidade = honorários/mensalidade de escritório de contabilidade
- outro = qualquer outra guia (preencha "descricao" com até 5 palavras, ex.: "Taxa de licenciamento")
Regras:
- documento = CNPJ/CPF do CONTRIBUINTE/SACADO/PAGADOR/EMPREGADOR/PRESTADOR (nunca do banco, cedente ou órgão). Não confunda com inscrição municipal/estadual.
- documentos = lista com TODOS os números de CNPJ (14), CPF (11) ou raiz de CNPJ (8) visíveis, inclusive o do contribuinte.
- competencia = mês/ano de referência (período de apuração), formato MM/AAAA. Se o documento mostrar uma data de período de apuração (ex.: 30/09/2026), use o mês dela (09/2026).
- valor = valor TOTAL a pagar (com multa/juros, se houver).
- vencimento = data de vencimento ou "pagar este documento até", formato YYYY-MM-DD.
- Se um campo não estiver claro, use null. NUNCA invente.`;

const RE_COMP = /^(0[1-9]|1[0-2])\/\d{4}$/;

function parseJson(texto: string): GuiaLida | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const doc = typeof o.documento === "string" ? o.documento.replace(/\D/g, "") : "";
    const tipo =
      typeof o.tipo === "string" && (TIPOS_GUIA as readonly string[]).includes(o.tipo)
        ? (o.tipo as DocType)
        : null;
    const comp =
      typeof o.competencia === "string" ? o.competencia.trim().padStart(7, "0") : "";
    const valor = o.valor == null ? null : Number(o.valor);
    const venc =
      typeof o.vencimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.vencimento)
        ? o.vencimento
        : null;
    const descricao =
      tipo === "outro" && typeof o.descricao === "string" && o.descricao.trim()
        ? o.descricao.trim().slice(0, 120)
        : null;
    const documentos = Array.isArray(o.documentos)
      ? [...new Set(
          o.documentos
            .map((x) => String(x).replace(/\D/g, ""))
            .filter((x) => x.length === 14 || x.length === 11 || x.length === 8),
        )].slice(0, 20)
      : [];
    return {
      documento: doc.length === 14 || doc.length === 11 ? doc : null,
      documentos,
      tipo,
      descricao,
      competencia: RE_COMP.test(comp) ? comp : null,
      valor: valor != null && Number.isFinite(valor) && valor > 0 ? valor : null,
      vencimento: venc,
    };
  } catch {
    return null;
  }
}

export async function lerGuia(pdfBase64: string): Promise<GuiaLida | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados desta guia:" },
              {
                type: "file",
                file: {
                  filename: "guia.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[ai] lerGuia ${res.status}: ${detail.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const texto = data.choices?.[0]?.message?.content?.trim();
    return texto ? parseJson(texto) : null;
  } catch (err) {
    console.error("[ai] lerGuia falhou:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
