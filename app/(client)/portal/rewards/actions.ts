"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyRewardsEvents } from "@/lib/email/notify-rewards";
import { REWARDS } from "@/lib/rewards";

// Códigos Postgres que indicam "SJ Rewards ainda não migrado" (0018 não aplicada).
const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

export type RedeemResult =
  | { ok: true; balance?: number }
  | {
      ok: false;
      reason: "invalid" | "insufficient" | "forbidden" | "not_migrated" | "error";
    };

/**
 * Resgata um prêmio. O CUSTO vem do catálogo no servidor (nunca do cliente) e o
 * débito é atômico no banco (função rewards_redeem, com trava de saldo). Devolve
 * o novo saldo para a tela reconciliar o valor otimista.
 *
 * O preço é lido de `rewards_catalog` (autoritativo). Se a tabela ainda não
 * existe (0021 não aplicada), usa o catálogo do código. Se a tabela existe mas o
 * prêmio não está visível (inativo/inexistente), o resgate é recusado.
 */
export async function redeemReward(
  companyId: string,
  rewardId: string,
): Promise<RedeemResult> {
  if (!companyId || !rewardId) return { ok: false, reason: "invalid" };

  const supabase = await createClient();

  // Preço/rótulo autoritativos do banco.
  let cost: number;
  let name: string;
  let icon: string;
  const { data: cat, error: catErr } = await supabase
    .from("rewards_catalog")
    .select("name,cost,icon")
    .eq("id", rewardId)
    .maybeSingle();

  if (catErr) {
    if (catErr.code !== UNDEFINED_TABLE) {
      console.error("[rewards] catálogo:", catErr.message);
      return { ok: false, reason: "error" };
    }
    // Pré-migração: cai no catálogo do código.
    const reward = REWARDS.find((r) => r.id === rewardId);
    if (!reward) return { ok: false, reason: "invalid" };
    cost = reward.cost;
    name = reward.name;
    icon = reward.icon;
  } else if (!cat) {
    // Tabela existe, mas o prêmio está inativo ou não existe → recusa.
    return { ok: false, reason: "invalid" };
  } else {
    cost = cat.cost as number;
    name = cat.name as string;
    icon = cat.icon as string;
  }

  const { data, error } = await supabase.rpc("rewards_redeem", {
    c: companyId,
    p_reward_id: rewardId,
    p_cost: cost,
    p_label: `Resgate: ${name}`,
    p_icon: icon,
  });

  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      return { ok: false, reason: "not_migrated" };
    }
    if (/saldo insuficiente/i.test(error.message)) {
      return { ok: false, reason: "insufficient" };
    }
    if (/permiss/i.test(error.message)) {
      return { ok: false, reason: "forbidden" };
    }
    console.error("[rewards] resgate:", error.message);
    return { ok: false, reason: "error" };
  }

  revalidatePath("/portal/rewards");
  return { ok: true, balance: typeof data === "number" ? data : undefined };
}

/**
 * Contabiliza o acesso do dia (atualiza a sequência e credita o bônus diário, uma
 * vez por dia). Silencioso: se ainda não migrou, apenas não faz nada.
 */
export async function registerAccess(companyId: string): Promise<void> {
  if (!companyId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("rewards_register_access", {
    c: companyId,
  });
  if (
    error &&
    error.code !== UNDEFINED_FUNCTION &&
    error.code !== UNDEFINED_TABLE
  ) {
    console.error("[rewards] registrar acesso:", error.message);
  }
}

/**
 * Avalia conquistas e subida de nível da empresa (idempotente no banco) e, se
 * algo NOVO aconteceu, dispara os avisos por e-mail em segundo plano (`after`).
 * Silencioso se ainda não migrou. Chamado no carregamento da aba SJ Rewards.
 */
export async function runRewardsChecks(companyId: string): Promise<void> {
  if (!companyId) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rewards_evaluate", {
    c: companyId,
  });
  if (error) {
    if (
      error.code !== UNDEFINED_FUNCTION &&
      error.code !== UNDEFINED_TABLE
    ) {
      console.error("[rewards] avaliação:", error.message);
    }
    return;
  }

  const events = (data ?? {}) as {
    levelUp?: string | null;
    achievements?: string[];
  };
  if (!events.levelUp && (events.achievements?.length ?? 0) === 0) return;

  // Não bloqueia a renderização: os e-mails saem em segundo plano.
  after(() =>
    notifyRewardsEvents(companyId, events).catch((e) =>
      console.error("[rewards] notificação:", e),
    ),
  );
}
