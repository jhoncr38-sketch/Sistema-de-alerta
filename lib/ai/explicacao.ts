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
  outro:
    "Guia de pagamento da sua empresa. Confira o valor e o vencimento; em caso " +
    "de dúvida sobre do que se trata, fale com seu contador.",
};

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

const SYSTEM =
  "Você explica termos contábeis brasileiros para leigos (donos de pequenas " +
  "empresas). Escreva em português do Brasil, tom cordial e tranquilizador, no " +
  "máximo 3 frases curtas. Explique o que é a guia, para que serve e, em uma " +
  "frase, o que acontece se atrasar (multa/juros) ou o que fazer. Não dê " +
  "consultoria fiscal específica, não cite valores nem prazos exatos e não use " +
  "markdown. Não invente detalhes que não conheça com certeza.";

/**
 * Retorna a explicação do tipo, usando o cache no banco. Gera pela IA na 1ª vez
 * (e grava), ou cai no texto de reserva. Nunca lança: o botão sempre mostra algo.
 */
export async function explicarTipo(type: DocType): Promise<{
  texto: string;
  fonte: "ia" | "fallback" | "cache";
}> {
  const supabase = createAdminClient();

  // 1) Já temos em cache? Devolve na hora (custo zero).
  const { data: existente } = await supabase
    .from("doc_explanations")
    .select("texto")
    .eq("doc_type", type)
    .maybeSingle();
  if (existente?.texto) {
    return { texto: existente.texto, fonte: "cache" };
  }

  // 2) Sem cache: tenta a IA. Sem chave, usa reserva (sem gravar — pode gerar
  //    depois quando a chave existir).
  if (!isAiConfigured()) {
    return { texto: textoReserva(type), fonte: "fallback" };
  }

  const label = docTypeLabel(type);
  const texto = await chatComplete(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Explique de forma simples a guia: "${label}" (usada no Brasil).`,
      },
    ],
    { temperature: 0.3, maxTokens: 220 },
  );

  if (!texto) {
    // IA falhou agora — devolve reserva, sem gravar (tenta de novo na próxima).
    return { texto: textoReserva(type), fonte: "fallback" };
  }

  // 3) Grava no cache para as próximas leituras (best-effort).
  await supabase
    .from("doc_explanations")
    .upsert({ doc_type: type, texto, fonte: "ia" }, { onConflict: "doc_type" });

  return { texto, fonte: "ia" };
}
