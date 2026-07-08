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

const SYSTEM = `Você é um contador experiente e acolhedor explicando a SITUAÇÃO FISCAL de uma empresa para o dono, que é LEIGO em impostos. Fale como se explicasse para um amigo: português do Brasil, simples, curto e sem jargão. Traduza termos técnicos (ex.: em vez de "exigibilidade suspensa", diga "está sendo discutido/contestado, então não precisa pagar agora").

FORMATE a resposta em Markdown, para ficar fácil de ler:
- Comece com uma frase curta de contexto (1 a 2 frases), em tom calmo e acolhedor, indo direto ao panorama do que há (ex.: "Encontramos **4 guias de 05/2026** que ainda não foram pagas — nada grave, é só acertar. 😊"). NÃO repita o nome da empresa nem diga "sua empresa está ativa e regular no cadastro" — o cliente já sabe disso; foque no que ele precisa saber/fazer. Se estiver tudo em dia, diga isso de forma tranquilizadora ✅.
- Depois, se houver pendências, liste as PRINCIPAIS em itens começando com "- ". Seja ENXUTO: no máximo ~6 itens no total. NÃO liste parcela por parcela de um parcelamento — agrupe numa linha só (ex.: "**Parcelamento MEI**: 6 parcelas em atraso, somando **R$ 661,37**"). Agrupe também vários débitos do mesmo tributo/mês quando fizer sentido.
- Use **negrito** nos pontos importantes: nomes dos tributos, valores em R$ e prazos/datas.
- Sempre que o documento indicar o período/competência de um débito, inclua no formato MM/AAAA (ex.: **PIS 05/2026**).
- Se preferir dar o total geral em vez de detalhar tudo, pode dizer o valor total das pendências.
- Termine com uma linha "**O que fazer:**" seguida da orientação prática (curta), e um fecho amigável curto (ex.: "Qualquer dúvida, estamos por aqui.").

Regras invioláveis:
- Baseie-se SOMENTE no documento. NUNCA invente valores, datas, competências ou pendências. Se um dado não estiver claro, omita-o.
- Se estiver tudo regular, diga isso de forma tranquilizadora e não invente problemas.
- Seja conciso e não repetitivo: o parágrafo de contexto, a lista e o "O que fazer" devem caber em poucas linhas cada.`;

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
        temperature: 0.4,
        max_tokens: 650,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Explique a situação fiscal desta empresa em linguagem simples e com a formatação pedida (negrito, lista, competências MM/AAAA): está em dia ou há pendências? O que fazer?",
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
