/**
 * Resumo humano da situação fiscal (SITFIS) por IA.
 *
 * Recebe o PDF do relatório da Receita (base64) e devolve um texto curto e em
 * português simples, para o cliente leigo entender se está tudo em dia ou o que
 * precisa resolver. A IA lê o PDF direto (gpt-4o-mini com input de arquivo) e
 * NÃO inventa nada — usa só o que está no documento. Fail-open: retorna null se
 * a IA não estiver configurada ou a chamada falhar.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const TIMEOUT_MS = 30_000;

const SYSTEM = `Você é um contador experiente e acolhedor explicando a SITUAÇÃO FISCAL de uma empresa para o dono, que é leigo em impostos. Escreva em português do Brasil, claro e sem jargão.
Regras:
- Baseie-se SOMENTE no documento. Nunca invente valores, datas ou pendências.
- Se estiver tudo regular, diga isso de forma tranquilizadora.
- Se houver pendências, liste as principais de forma objetiva e diga o que fazer.
- Máximo 5 frases. Sem saudação e sem despedida.`;

/**
 * Gera o resumo da situação fiscal a partir do PDF (base64). Retorna o texto ou
 * null (sem chave / falha / timeout) — quem chama trata a ausência.
 */
export async function explicarSitfis(pdfBase64: string): Promise<string | null> {
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
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Resuma a situação fiscal desta empresa para o cliente entender: está em dia ou há pendências? O que fazer?",
              },
              {
                type: "file",
                file: {
                  filename: "situacao-fiscal.pdf",
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
      console.error(`[ai] explicarSitfis ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[ai] explicarSitfis falhou:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
