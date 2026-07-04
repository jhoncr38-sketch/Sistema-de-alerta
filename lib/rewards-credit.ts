// Crédito automático de SJ Coins a partir de eventos reais do ContAlert.
// Server-only: recebe o cliente Supabase da requisição e chama a função
// SECURITY DEFINER rewards_credit (que valida a permissão por dentro).
import type { createClient } from "@/lib/supabase/server";
import type { DocCategoria, DocType } from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Códigos Postgres que indicam "SJ Rewards ainda não migrado" (0018 não aplicada).
const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

/**
 * A empresa pode acumular SJ Coins? O contador liga/desliga o clube por empresa
 * (companies.rewards_enabled). Desligado → nenhum crédito automático é gerado.
 * Pré-migração (coluna ainda não existe) ou erro de leitura → assume LIGADO,
 * para não mudar o comportamento anterior por acidente.
 */
async function rewardsEnabled(
  supabase: ServerClient,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("companies")
    .select("rewards_enabled")
    .eq("id", companyId)
    .maybeSingle();
  if (error) return true; // coluna ausente/erro de leitura → não bloqueia
  return data?.rewards_enabled !== false;
}

/**
 * Avança em +1 as missões com o gatilho `trigger` para a empresa (globais ou
 * exclusivas dela), idempotente por `dedupeKey` no banco — um mesmo evento nunca
 * conta em dobro. Ao bater a meta, a função no banco credita a recompensa uma
 * única vez. Best-effort e silencioso se a 0028 ainda não foi aplicada.
 */
export async function advanceMissions(
  supabase: ServerClient,
  args: { companyId: string; trigger: string; dedupeKey: string },
): Promise<void> {
  const { error } = await supabase.rpc("rewards_mission_advance", {
    c: args.companyId,
    p_trigger: args.trigger,
    p_dedupe_key: args.dedupeKey,
  });
  if (
    error &&
    error.code !== UNDEFINED_FUNCTION &&
    error.code !== UNDEFINED_TABLE
  ) {
    console.error("[rewards] avanço de missão:", error.message);
  }
}

/**
 * Consulta a regra de ganho (boa ação) editável pelo contador. Retorna:
 *   • objeto com coins/xp/active quando a regra existe;
 *   • "absent" quando a tabela existe mas a regra foi apagada (→ crédito desativado);
 *   • "no_table" quando a tabela ainda não existe / falha de leitura (→ usa o
 *     valor padrão do código, comportamento pré-migração).
 */
type EarnLookup =
  | { coins: number; xp: number; active: boolean }
  | "absent"
  | "no_table";

async function lookupEarnRule(
  supabase: ServerClient,
  key: string,
): Promise<EarnLookup> {
  const { data, error } = await supabase
    .from("rewards_earn_rules")
    .select("coins,xp,active")
    .eq("key", key)
    .maybeSingle();

  if (error) return "no_table"; // best-effort: não perde crédito por erro de leitura
  if (!data) return "absent";
  return {
    coins: data.coins as number,
    xp: data.xp as number,
    active: data.active as boolean,
  };
}

interface PaidDoc {
  id: string;
  companyId: string;
  categoria: DocCategoria;
  type: DocType;
  dueDate: string | null; // ISO (YYYY-MM-DD)
}

interface PaymentReward {
  label: string;
  icon: string;
  coins: number;
  xp: number;
  actionKey: string;
}

/** Fallback fixo — usado só se a tabela/coluna de regras ainda não existe. */
function hardcodedPaymentReward(
  categoria: DocCategoria,
  type: DocType,
): PaymentReward | null {
  if (categoria === "parcelamento") {
    return { label: "Parcela paga em dia", icon: "calendar-check", coins: 80, xp: 80, actionKey: "parcelamento-em-dia" };
  }
  if (categoria === "boleto") {
    if (type === "mensalidade") {
      return { label: "Honorários pagos em dia", icon: "dollar", coins: 100, xp: 100, actionKey: "honorarios-em-dia" };
    }
    return { label: "Guia paga em dia", icon: "file-check", coins: 80, xp: 80, actionKey: "guia-em-dia" };
  }
  return null;
}

/**
 * Resolve QUAL recompensa um pagamento gera, a partir das boas ações editáveis
 * pelo contador (rewards_earn_rules): procura a regra cujo gatilho
 * (pay_categoria/pay_type) casa com a guia paga — preferindo o tipo específico
 * (ex.: Mensalidade) ao genérico "qualquer boleto".
 *   • regra casada e ATIVA  → usa o valor dela;
 *   • regra casada mas OCULTA → não credita (contador desligou aquele tipo);
 *   • nenhum tipo mapeado    → boleto ganha o +80 genérico; demais, nada.
 * Se a tabela/coluna ainda não existe, cai no fallback fixo.
 */
async function resolvePaymentReward(
  supabase: ServerClient,
  categoria: DocCategoria,
  type: DocType,
): Promise<PaymentReward | null> {
  const { data, error } = await supabase
    .from("rewards_earn_rules")
    .select("key,label,icon,coins,xp,pay_type,active")
    .eq("pay_categoria", categoria); // ativas + inativas (RLS libera leitura)

  if (error) return hardcodedPaymentReward(categoria, type); // pré-migração

  const rules = data ?? [];
  const match =
    rules.find((r) => r.pay_type === type) ?? // regra específica do tipo
    rules.find((r) => r.pay_type == null); // regra genérica da categoria

  if (match) {
    if (!match.active) return null; // tipo mapeado porém oculto → não credita
    return {
      label: match.label as string,
      icon: match.icon as string,
      coins: match.coins as number,
      xp: match.xp as number,
      actionKey: match.key as string,
    };
  }

  // Nenhuma regra mapeada para este tipo: mantém o +80 genérico só para boletos.
  if (categoria === "boleto") {
    return { label: "Guia paga em dia", icon: "file-check", coins: 80, xp: 80, actionKey: "guia-em-dia" };
  }
  return null; // folha e documentos informativos não geram crédito
}

/**
 * Credita SJ Coins quando uma guia é paga EM DIA (na data de vencimento ou antes).
 * A recompensa vem do vínculo tipo de documento → boa ação (editável pelo contador
 * em "Boas ações"). Idempotente por documento (dedupe_key 'pago:{id}') — marcar/
 * desmarcar pago não credita duas vezes. Best-effort: nunca deixa o pagamento falhar.
 */
export async function creditPaymentOnTime(
  supabase: ServerClient,
  doc: PaidDoc,
): Promise<void> {
  if (!doc.dueDate) return;
  const today = new Date().toISOString().slice(0, 10);
  if (today > doc.dueDate) return; // pago com atraso — sem crédito
  if (!(await rewardsEnabled(supabase, doc.companyId))) return; // clube desligado

  // Missões automáticas de "pagar em dia" avançam pelo EVENTO — independem de
  // este tipo de guia gerar (ou não) crédito de moedas abaixo.
  await advanceMissions(supabase, {
    companyId: doc.companyId,
    trigger: "pagamento_em_dia",
    dedupeKey: `pago:${doc.id}`,
  });

  const reward = await resolvePaymentReward(supabase, doc.categoria, doc.type);
  if (!reward) return;

  const { error } = await supabase.rpc("rewards_credit_earned", {
    c: doc.companyId,
    p_label: reward.label,
    p_icon: reward.icon,
    p_coins: reward.coins,
    p_xp: reward.xp,
    p_action_key: reward.actionKey,
    p_dedupe_key: `pago:${doc.id}`,
  });

  if (
    error &&
    error.code !== UNDEFINED_FUNCTION &&
    error.code !== UNDEFINED_TABLE
  ) {
    console.error("[rewards] crédito por pagamento em dia:", error.message);
  }
}

/**
 * Credita SJ Coins quando o cliente envia um documento solicitado NO PRAZO
 * (na data limite ou antes; sem prazo = sempre no prazo). Idempotente por
 * solicitação (dedupe_key 'envio:{id}'). Best-effort.
 */
export async function creditDocumentOnTime(
  supabase: ServerClient,
  args: { companyId: string; requestId: string; dueDate: string | null },
): Promise<void> {
  if (args.dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > args.dueDate) return; // enviou após o prazo — sem crédito
  }
  if (!(await rewardsEnabled(supabase, args.companyId))) return; // clube desligado

  // Missões automáticas de "enviar no prazo" avançam pelo EVENTO.
  await advanceMissions(supabase, {
    companyId: args.companyId,
    trigger: "documento_no_prazo",
    dedupeKey: `envio:${args.requestId}`,
  });

  // Valor/estado da regra editável (apagada/oculta → não credita).
  let coins = 100;
  let xp = 100;
  const rule = await lookupEarnRule(supabase, "doc-no-prazo");
  if (rule === "absent") return;
  if (rule !== "no_table") {
    if (!rule.active) return;
    coins = rule.coins;
    xp = rule.xp;
  }

  const { error } = await supabase.rpc("rewards_credit_earned", {
    c: args.companyId,
    p_label: "Documento enviado no prazo",
    p_icon: "file-check",
    p_coins: coins,
    p_xp: xp,
    p_action_key: "doc-no-prazo",
    p_dedupe_key: `envio:${args.requestId}`,
  });

  if (
    error &&
    error.code !== UNDEFINED_FUNCTION &&
    error.code !== UNDEFINED_TABLE
  ) {
    console.error("[rewards] crédito por envio no prazo:", error.message);
  }
}

/**
 * Anula a recompensa que tinha sido creditada por um pagamento, quando a guia é
 * DESMARCADA (marcada como paga por engano). Desfaz o saldo (sem deixar negativo)
 * e remove a linha do extrato — o crédito volta a poder ser concedido se a guia
 * for paga de novo. Idempotente e best-effort: nunca deixa o desmarcar falhar.
 */
export async function reversePaymentCredit(
  supabase: ServerClient,
  args: { companyId: string; docId: string },
): Promise<void> {
  const { error } = await supabase.rpc("rewards_reverse_credit", {
    c: args.companyId,
    p_dedupe_key: `pago:${args.docId}`,
  });

  if (
    error &&
    error.code !== UNDEFINED_FUNCTION &&
    error.code !== UNDEFINED_TABLE
  ) {
    console.error("[rewards] estorno de pagamento:", error.message);
  }
}
