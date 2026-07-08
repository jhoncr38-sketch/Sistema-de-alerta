import { chatComplete } from "@/lib/ai/openai";

/**
 * Explicação curta e humana de uma guia (DAS/DARF) recém-publicada, para o
 * cliente leigo. Diferente do SITFIS, aqui a IA NÃO lê PDF — recebe os dados já
 * estruturados (que o código apurou da Receita) e só redige a frase. Barato.
 *
 * Fail-open: retorna null se a IA não estiver configurada ou falhar — quem chama
 * publica sem a explicação (não bloqueia).
 */

const TRIBUTO_LABEL: Record<string, string> = {
  das: "DAS do Simples Nacional",
  darf_piscofins: "DARF de PIS/COFINS",
  darf_irpj: "DARF de IRPJ",
  darf_csll: "DARF de CSLL",
  gps_inss: "guia de INSS",
};

/** "MM/AAAA" a partir da competência armazenada (já vem "MM/AAAA"). */
function periodoLabel(competencia: string | null): string {
  return competencia?.trim() ? competencia.trim() : "";
}

export async function explicarGuiaPublicada(params: {
  type: string;
  competencia: string | null;
  valor: number | null;
  vencimento: string | null; // YYYY-MM-DD
}): Promise<string | null> {
  const tributo = TRIBUTO_LABEL[params.type] ?? "guia de imposto";
  const periodo = periodoLabel(params.competencia);
  const valorBR =
    params.valor != null
      ? params.valor.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })
      : null;
  const vencBR = params.vencimento
    ? params.vencimento.split("-").reverse().join("/")
    : null;

  // Passa os DADOS JÁ PRONTOS; a IA só redige (nunca calcula/inventa valores).
  const fatos = [
    `Tributo: ${tributo}`,
    periodo ? `Competência: ${periodo}` : null,
    valorBR ? `Valor: ${valorBR}` : null,
    vencBR ? `Vencimento: ${vencBR}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const texto = await chatComplete(
    [
      {
        role: "system",
        content: `Você é um contador acolhedor explicando uma guia de imposto para o dono da empresa, que é leigo. Escreva em português do Brasil, simples e curto (1 a 2 frases). Use SOMENTE os dados fornecidos — nunca invente valores nem datas. Diga em linguagem clara o que é a guia, o valor e até quando pagar. Sem saudação e sem despedida. Pode usar **negrito** no valor e na data.`,
      },
      {
        role: "user",
        content: `Explique esta guia para o cliente:\n${fatos}`,
      },
    ],
    { maxTokens: 160, temperature: 0.3 },
  );
  return texto?.trim() || null;
}
