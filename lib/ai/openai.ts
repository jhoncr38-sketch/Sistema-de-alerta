/**
 * Cliente mínimo da OpenAI via fetch (sem SDK, para não pesar o bundle).
 * Usado só no servidor — nunca importe em Client Components (a chave é secreta).
 *
 * Segue o mesmo princípio do sendEmail (lib/email/resend.ts): se a chave não
 * estiver configurada, NÃO quebra — devolve `null` e quem chama trata a ausência
 * como "recurso indisponível". Assim o site funciona igual sem a OPENAI_API_KEY.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Modelo econômico e rápido — suficiente para redigir textos curtos em pt-BR.
// Trocável por env sem mexer no código (ex.: testar gpt-4o).
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Teto de segurança: o assistente pode demorar, mas nunca deve travar a
// requisição indefinidamente (nem estourar custo com respostas gigantes).
const TIMEOUT_MS = 20_000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Criatividade. 0.2 mantém respostas objetivas e previsíveis (bom p/ dados). */
  temperature?: number;
  /** Teto de tokens da RESPOSTA — limita tamanho e custo. */
  maxTokens?: number;
  /** Sobrescreve o modelo padrão pontualmente. */
  model?: string;
}

/** True quando a integração está configurada (há chave). */
export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Envia uma conversa ao modelo e devolve o texto da resposta.
 * Retorna `null` se a IA não estiver configurada ou se a chamada falhar —
 * best-effort, nunca lança para não derrubar cron/página que a utiliza.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[ai] OPENAI_API_KEY ausente — recurso de IA desativado.");
    return null;
  }

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
        model: opts.model ?? DEFAULT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 500,
      }),
      signal: controller.signal,
      // Chamada dinâmica: nunca cachear no fetch do Next.
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[ai] OpenAI ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[ai] OpenAI: tempo esgotado.");
    } else {
      console.error("[ai] OpenAI: falha na chamada:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
