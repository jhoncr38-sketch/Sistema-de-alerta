import { chatComplete, isAiConfigured } from "@/lib/ai/openai";
import { docTypeLabel } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

/**
 * Explicação em linguagem simples de cada TIPO de guia (o botão "O que é isso?"
 * no portal do cliente). Diz o que é o tributo, pra que serve e o que fazer se
 * atrasar — para o cliente leigo entender sem ligar para o contador.
 *
 * REGRA DE OURO (mesma do assistente): a IA só ESCREVE o texto. Ela não vê
 * nenhum dado do cliente — a explicação é conhecimento geral sobre o imposto,
 * igual para todas as empresas. Por isso guardamos em cache por tipo
 * (tabela doc_explanations): gera uma vez, reaproveita sempre (custo ~zero e
 * resposta instantânea). Se a IA não estiver configurada ou falhar, devolvemos
 * um texto de reserva embutido, então o botão nunca fica "quebrado".
 */

/** Textos de reserva (sem IA). Curtos e cuidadosos — sem consultoria fiscal. */
const FALLBACK: Partial<Record<DocType, string>> = {
  das:
    "O DAS é a guia única do Simples Nacional: reúne, em um só boleto mensal, " +
    "os principais impostos da empresa optante pelo Simples. Vence todo mês. " +
    "Se atrasar, incide multa e juros — pague assim que possível e avise seu " +
    "contador se tiver dúvida sobre o valor.",
  darf_irpj:
    "O DARF de IRPJ recolhe o Imposto de Renda da Pessoa Jurídica, calculado " +
    "sobre o lucro da empresa. Se atrasar, há multa e juros. Em caso de dúvida " +
    "sobre o valor, fale com seu contador.",
  darf_piscofins:
    "Este DARF recolhe o PIS e a COFINS, contribuições federais que incidem " +
    "sobre o faturamento da empresa. Se atrasar, incide multa e juros.",
  darf_csll:
    "O DARF de CSLL recolhe a Contribuição Social sobre o Lucro Líquido, um " +
    "tributo federal calculado sobre o lucro. Se atrasar, há multa e juros.",
  gps_inss:
    "A GPS recolhe a contribuição ao INSS (Previdência Social), ligada à folha " +
    "e aos sócios. Manter em dia preserva os direitos previdenciários. Se " +
    "atrasar, incide multa e juros.",
  iss:
    "O ISS é o imposto municipal sobre serviços prestados. A alíquota e o " +
    "vencimento variam conforme o município. Se atrasar, há multa e juros.",
  iss_rpa:
    "Este ISS refere-se ao RPA (Recibo de Pagamento a Autônomo): o imposto sobre " +
    "o serviço de um profissional autônomo. Se atrasar, incide multa e juros.",
  icms:
    "O ICMS é o imposto estadual sobre a circulação de mercadorias (e alguns " +
    "serviços). Recolhido mensalmente conforme as operações da empresa. Se " +
    "atrasar, há multa e juros.",
  fgts:
    "O FGTS é o depósito mensal na conta vinculada de cada funcionário (Fundo " +
    "de Garantia). Não é imposto, mas é obrigatório. Atrasar gera encargos e " +
    "prejudica o trabalhador — mantenha em dia.",
  mensalidade:
    "É a mensalidade dos serviços de contabilidade prestados pelo seu escritório " +
    "contábil. Cobre a rotina fiscal, contábil e trabalhista da empresa.",
  folha:
    "A folha de pagamento consolida salários, encargos e descontos dos " +
    "funcionários no mês. É um documento de referência para os pagamentos e " +
    "recolhimentos trabalhistas.",
  // --- Documentos institucionais (não são guias de imposto) ---
  cartao_cnpj:
    "O Cartão CNPJ é o comprovante de inscrição da empresa na Receita Federal. " +
    "Traz os dados oficiais do negócio (CNPJ, endereço, atividades). Serve para " +
    "comprovar a existência e a situação da empresa em bancos, licitações e " +
    "contratos.",
  contrato_social:
    "O Contrato Social é o documento que cria a empresa e define suas regras: " +
    "sócios, participação de cada um, atividade e capital. É a “certidão de " +
    "nascimento” do negócio, exigida em bancos e órgãos públicos.",
  licenca:
    "A Licença é a autorização de um órgão (ambiental, sanitário, etc.) para a " +
    "empresa exercer determinada atividade. Costuma ter validade — fique atento " +
    "à renovação para não funcionar irregular.",
  alvara:
    "O Alvará é a autorização da prefeitura para a empresa funcionar naquele " +
    "endereço. Em geral precisa ser renovado periodicamente; mantê-lo em dia " +
    "evita multas e problemas na fiscalização.",
  relatorio_fiscal:
    "O Relatório Fiscal é um documento preparado pela contabilidade com um " +
    "resumo da situação fiscal da empresa no período. Serve para acompanhamento " +
    "e conferência — guarde para consulta.",
  outro:
    "Guia de pagamento da sua empresa. Confira o valor e o vencimento; em caso " +
    "de dúvida sobre do que se trata, fale com seu contador.",
};

/** Tipos que são DOCUMENTO institucional (não guia de imposto) — muda o prompt
 *  da IA (explicar o documento e pra que serve, sem falar de multa/juros). */
const DOCUMENTO_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  "cartao_cnpj",
  "contrato_social",
  "licenca",
  "alvara",
  "relatorio_fiscal",
]);

/** Reserva final quando o tipo não está no mapa acima. */
function fallbackGenerico(type: DocType): string {
  return (
    `${docTypeLabel(type)}: guia relacionada às obrigações da sua empresa. ` +
    "Confira o valor e o vencimento; se tiver dúvida, fale com seu contador."
  );
}

function textoReserva(type: DocType): string {
  return FALLBACK[type] ?? fallbackGenerico(type);
}

// --- Parcelamento -----------------------------------------------------------
// Uma parcela NÃO é um imposto avulso: é uma das prestações de um parcelamento
// (acordo para pagar uma dívida em várias vezes, tipo REFIS). Explicamos o que é
// o parcelamento, não o tributo. Cache com chave própria p/ não colidir com os
// tipos (doc_type = '__parcelamento__').
const PARCELAMENTO_KEY = "__parcelamento__";

const PARCELAMENTO_FALLBACK =
  "Esta é uma parcela de um parcelamento: um acordo para quitar uma dívida " +
  "(de impostos) em várias prestações mensais. A cada mês vence uma parcela — " +
  "pague em dia, porque atrasar pode cancelar o parcelamento e reativar a " +
  "dívida toda. Em caso de dúvida, fale com seu contador.";

const PARCELAMENTO_PROMPT =
  "Explique, para o dono de uma pequena empresa, o que é uma PARCELA de um " +
  "PARCELAMENTO tributário no Brasil (um acordo para pagar uma dívida de " +
  "impostos em prestações mensais, como REFIS). Deixe claro que a cada mês " +
  "vence uma parcela e que atrasar pode cancelar o parcelamento e cobrar a " +
  "dívida toda de volta. Não é um imposto novo, é o pagamento de uma dívida " +
  "já negociada.";

const SYSTEM =
  "Você explica termos contábeis brasileiros para leigos (donos de pequenas " +
  "empresas). Escreva em português do Brasil, tom cordial e tranquilizador, no " +
  "máximo 3 frases curtas. Explique o que é e para que serve, seguindo a " +
  "instrução do pedido. Não dê " +
  "consultoria fiscal específica, não cite valores nem prazos exatos e não use " +
  "markdown. Não invente detalhes que não conheça com certeza.";

export interface Explicacao {
  texto: string;
  fonte: "ia" | "fallback" | "cache";
}

/**
 * Núcleo do cache: dada uma CHAVE (doc_type ou '__parcelamento__'), devolve a
 * explicação. Lê do banco; se não houver, gera com o `prompt` dado e grava;
 * em falha/sem chave, usa `reserva`. Nunca lança.
 */
async function explicarPorChave(
  chave: string,
  prompt: string,
  reserva: string,
): Promise<Explicacao> {
  const supabase = createAdminClient();

  // 1) Já temos em cache? Devolve na hora (custo zero).
  const { data: existente } = await supabase
    .from("doc_explanations")
    .select("texto")
    .eq("doc_type", chave)
    .maybeSingle();
  if (existente?.texto) {
    return { texto: existente.texto, fonte: "cache" };
  }

  // 2) Sem cache: tenta a IA. Sem chave, usa reserva (sem gravar — pode gerar
  //    depois quando a chave existir).
  if (!isAiConfigured()) {
    return { texto: reserva, fonte: "fallback" };
  }

  const texto = await chatComplete(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    { temperature: 0.3, maxTokens: 220 },
  );

  if (!texto) {
    // IA falhou agora — devolve reserva, sem gravar (tenta de novo na próxima).
    return { texto: reserva, fonte: "fallback" };
  }

  // 3) Grava no cache para as próximas leituras (best-effort).
  await supabase
    .from("doc_explanations")
    .upsert({ doc_type: chave, texto, fonte: "ia" }, { onConflict: "doc_type" });

  return { texto, fonte: "ia" };
}

/** Explica uma parcela de parcelamento (o que é o parcelamento, não o tributo). */
export async function explicarParcelamento(): Promise<Explicacao> {
  return explicarPorChave(
    PARCELAMENTO_KEY,
    PARCELAMENTO_PROMPT,
    PARCELAMENTO_FALLBACK,
  );
}

/**
 * Retorna a explicação do tipo da guia, usando o cache no banco. Gera pela IA na
 * 1ª vez (e grava), ou cai no texto de reserva. Nunca lança.
 */
export async function explicarTipo(type: DocType): Promise<Explicacao> {
  const label = docTypeLabel(type);
  // Documento institucional: explicar o DOCUMENTO (não falar de guia/multa/juros).
  const prompt = DOCUMENTO_TYPES.has(type)
    ? `Explique de forma simples, para o dono de uma pequena empresa, o que é o ` +
      `documento "${label}" (usado no Brasil) e para que serve. Não fale em ` +
      `multa ou juros — não é uma guia de pagamento.`
    : `Explique de forma simples a guia: "${label}" (usada no Brasil).`;
  return explicarPorChave(type, prompt, textoReserva(type));
}

/**
 * Explica uma guia: se for parcela de parcelamento, explica o parcelamento;
 * senão, explica o tipo do tributo. É o que o endpoint usa.
 */
export async function explicarGuia(
  type: DocType,
  categoria?: string,
): Promise<Explicacao> {
  if (categoria === "parcelamento") return explicarParcelamento();
  return explicarTipo(type);
}
