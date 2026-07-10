/**
 * Leitura de boleto por IA: recebe o PDF (base64) e extrai cliente (CNPJ),
 * valor e vencimento, para pré-preencher a publicação de um boleto. A IA lê o
 * PDF direto (gpt-4o-mini com input de arquivo) e NÃO inventa — retorna null nos
 * campos que não achar. Fail-open: retorna null se a IA não estiver configurada.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const TIMEOUT_MS = 30_000;

export interface BoletoLido {
  /** CNPJ do contribuinte/sacado, só dígitos (14). null se não achou. */
  cnpj: string | null;
  /** Valor total a pagar, em reais. null se não achou. */
  valor: number | null;
  /** Vencimento ISO (YYYY-MM-DD). null se não achou. */
  vencimento: string | null;
}

const SYSTEM = `Você extrai dados de guias e boletos brasileiros (DAS, DARF, INSS, taxas, convênios, mensalidades). Responda SOMENTE um objeto JSON, sem texto extra e sem markdown, no formato:
{"cnpj":"<14 dígitos ou null>","valor":<número ou null>,"vencimento":"<YYYY-MM-DD ou null>"}
Regras:
- cnpj = do CONTRIBUINTE/SACADO/PAGADOR (não do banco/cedente). Só dígitos.
- valor = valor total a pagar (número, ponto decimal).
- vencimento = data de vencimento no formato YYYY-MM-DD.
- Se um campo não estiver claro no documento, use null. NUNCA invente.`;

/** Extrai só o JSON de uma resposta que pode vir com ```json ... ``` em volta. */
function parseJson(texto: string): BoletoLido | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const cnpj =
      typeof o.cnpj === "string" ? o.cnpj.replace(/\D/g, "") : null;
    const valor =
      o.valor == null ? null : Number(o.valor) || null;
    const vencimento =
      typeof o.vencimento === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(o.vencimento)
        ? o.vencimento
        : null;
    return {
      cnpj: cnpj && cnpj.length === 14 ? cnpj : null,
      valor,
      vencimento,
    };
  } catch {
    return null;
  }
}

export async function lerBoleto(pdfBase64: string): Promise<BoletoLido | null> {
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
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia cnpj do contribuinte, valor total e vencimento deste documento:",
              },
              {
                type: "file",
                file: {
                  filename: "boleto.pdf",
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
      console.error(`[ai] lerBoleto ${res.status}: ${detail.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const texto = data.choices?.[0]?.message?.content?.trim();
    return texto ? parseJson(texto) : null;
  } catch (err) {
    console.error("[ai] lerBoleto falhou:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
