"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

export interface SendCoinsState {
  error?: string;
  ok?: boolean;
}

function revalidateAdminRewards() {
  revalidatePath("/painel/rewards");
  revalidatePath("/portal/rewards");
}

/** Só dígitos → inteiro não-negativo (ex.: "1.500" -> 1500). */
function toInt(raw: unknown): number {
  const n = parseInt(String(raw ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Admin credita SJ Coins e/ou XP manualmente a uma empresa (bônus, correção). */
export async function sendRewardCoins(
  _prev: SendCoinsState,
  formData: FormData,
): Promise<SendCoinsState> {
  await requireAdmin();

  const companyId = String(formData.get("company_id") ?? "");
  const coins = toInt(formData.get("coins"));
  const xp = toInt(formData.get("xp"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!companyId) return { error: "Selecione a empresa." };
  if (coins <= 0 && xp <= 0) return { error: "Informe SJ Coins e/ou XP." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rewards_credit", {
    c: companyId,
    p_label: reason || "Bônus do escritório",
    p_icon: "gift",
    p_coins: coins,
    p_xp: xp,
    p_action_key: "admin-bonus",
    p_dedupe_key: null, // permite conceder vários bônus
  });
  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      return { error: "SJ Rewards não está ativo no banco (aplique a 0018)." };
    }
    return { error: error.message };
  }

  revalidateAdminRewards();
  return { ok: true };
}

/**
 * Admin RETIRA SJ Coins e/ou XP de uma empresa (correção, estorno de bônus dado
 * por engano). Nunca deixa o saldo negativo — retira no máximo o disponível.
 */
export async function withdrawRewardCoins(
  _prev: SendCoinsState,
  formData: FormData,
): Promise<SendCoinsState> {
  await requireAdmin();

  const companyId = String(formData.get("company_id") ?? "");
  const coins = toInt(formData.get("coins"));
  const xp = toInt(formData.get("xp"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!companyId) return { error: "Selecione a empresa." };
  if (coins <= 0 && xp <= 0) return { error: "Informe SJ Coins e/ou XP." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rewards_debit", {
    c: companyId,
    p_label: reason || "Retirada do escritório",
    p_icon: "trending-down",
    p_coins: coins,
    p_xp: xp,
    p_action_key: "admin-retirada",
    p_dedupe_key: null,
  });
  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      return { error: "Retirada não está ativa no banco (aplique a 0024)." };
    }
    return { error: error.message };
  }

  revalidateAdminRewards();
  return { ok: true };
}

/**
 * Admin marca um resgate como entregue ('fulfilled') ou o cancela ('canceled').
 * Ao cancelar um resgate ainda não cancelado, estorna as SJ Coins (idempotente).
 */
export async function updateRedemptionStatus(
  id: string,
  status: "fulfilled" | "canceled",
) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("rewards_redemptions")
    .select("company_id,reward_id,cost,status")
    .eq("id", id)
    .single();
  if (!r) throw new Error("Resgate não encontrado.");

  const { error } = await supabase
    .from("rewards_redemptions")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Cancelou algo que ainda não estava cancelado → estorna as moedas.
  if (status === "canceled" && r.status !== "canceled") {
    await supabase.rpc("rewards_credit", {
      c: r.company_id,
      p_label: "Estorno de resgate",
      p_icon: "refresh",
      p_coins: r.cost,
      p_xp: 0,
      p_action_key: "estorno",
      p_dedupe_key: `estorno:${id}`,
    });
  }

  revalidateAdminRewards();
}

// ─────────────────────────────────────────────────────────────────────────────
// Missões (migration 0020) — o contador cria, acompanha e conclui.
// ─────────────────────────────────────────────────────────────────────────────

export interface MissionFormState {
  error?: string;
  ok?: boolean;
}

/** Cria uma missão: global (empresa vazia) ou exclusiva de uma empresa. */
export async function createMission(
  _prev: MissionFormState,
  formData: FormData,
): Promise<MissionFormState> {
  const { user } = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "target").trim() || "target";
  const coins = toInt(formData.get("coins"));
  const xp = toInt(formData.get("xp"));
  const target = Math.max(1, toInt(formData.get("target")));
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const companyId = String(formData.get("company_id") ?? "").trim();

  if (!title) return { error: "Dê um título à missão." };
  if (coins <= 0 && xp <= 0) return { error: "Defina a recompensa (SJ Coins e/ou XP)." };

  const supabase = await createClient();
  const { error } = await supabase.from("rewards_missions").insert({
    title,
    description: description || null,
    icon,
    coins,
    xp,
    target,
    due_date: dueDate || null,
    company_id: companyId || null,
    created_by: user.id,
  });

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { error: "Missões não estão ativas no banco (aplique a 0020)." };
    }
    return { error: error.message };
  }

  revalidateAdminRewards();
  return { ok: true };
}

/** Edita os dados de uma missão existente (valores, meta, prazo, escopo). */
export async function updateMission(
  _prev: MissionFormState,
  formData: FormData,
): Promise<MissionFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missão inválida." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "target").trim() || "target";
  const coins = toInt(formData.get("coins"));
  const xp = toInt(formData.get("xp"));
  const target = Math.max(1, toInt(formData.get("target")));
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const companyId = String(formData.get("company_id") ?? "").trim();

  if (!title) return { error: "Dê um título à missão." };
  if (coins <= 0 && xp <= 0) return { error: "Defina a recompensa (SJ Coins e/ou XP)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards_missions")
    .update({
      title,
      description: description || null,
      icon,
      coins,
      xp,
      target,
      due_date: dueDate || null,
      company_id: companyId || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateAdminRewards();
  return { ok: true };
}

/** Encerra (exclui) uma missão — some do portal; o progresso vai junto (cascade). */
export async function deleteMission(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("rewards_missions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAdminRewards();
}

/**
 * Ajusta o progresso de uma empresa numa missão. Ao atingir a meta, a função no
 * banco credita a recompensa uma única vez (idempotente).
 */
export async function setMissionProgress(
  missionId: string,
  companyId: string,
  progress: number,
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("rewards_mission_set_progress", {
    p_mission_id: missionId,
    p_company_id: companyId,
    p_progress: Math.max(0, Math.round(progress)),
  });
  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      throw new Error("Missões não estão ativas no banco (aplique a 0020).");
    }
    throw new Error(error.message);
  }
  revalidateAdminRewards();
}

// ─────────────────────────────────────────────────────────────────────────────
// Loja de recompensas (migration 0021) — o contador edita/cria prêmios.
// ─────────────────────────────────────────────────────────────────────────────

const REWARD_CATEGORIES = ["servico", "consultoria", "brinde", "desconto"];
const REWARD_LEVELS = ["prata", "ouro", "diamante", "master", "elite"];

export interface RewardFormState {
  error?: string;
  ok?: boolean;
}

/**
 * Cria (id vazio) ou edita (id presente) um prêmio da loja. O custo é validado
 * como inteiro positivo. Revalida o portal — o novo preço vale na hora.
 */
export async function saveReward(
  _prev: RewardFormState,
  formData: FormData,
): Promise<RewardFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "gift").trim() || "gift";
  const cost = toInt(formData.get("cost"));
  const categoryRaw = String(formData.get("category") ?? "servico").trim();
  const category = REWARD_CATEGORIES.includes(categoryRaw) ? categoryRaw : "servico";
  const levelRaw = String(formData.get("requires_level") ?? "").trim();
  const requiresLevel = REWARD_LEVELS.includes(levelRaw) ? levelRaw : null;

  if (!name) return { error: "Dê um nome ao prêmio." };
  if (cost <= 0) return { error: "O custo deve ser maior que zero." };

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("rewards_catalog")
      .update({
        name,
        description,
        icon,
        cost,
        category,
        requires_level: requiresLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { error: "A loja não está no banco (aplique a 0021)." };
      }
      return { error: error.message };
    }
  } else {
    // Novo prêmio: id opaco e estável, e vai para o fim da lista.
    const { data: maxRow } = await supabase
      .from("rewards_catalog")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort = ((maxRow?.sort as number | undefined) ?? 0) + 1;

    const { error } = await supabase.from("rewards_catalog").insert({
      id: crypto.randomUUID(),
      name,
      description,
      icon,
      cost,
      category,
      requires_level: requiresLevel,
      sort,
    });
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { error: "A loja não está no banco (aplique a 0021)." };
      }
      return { error: error.message };
    }
  }

  revalidateAdminRewards();
  return { ok: true };
}

/** Liga/desliga um prêmio na loja (inativo some do portal, mas preserva histórico). */
export async function setRewardActive(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards_catalog")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAdminRewards();
}

// ─────────────────────────────────────────────────────────────────────────────
// Boas ações "Como ganhar SJ Coins" (migration 0022) — o contador edita/cria.
// Editar o valor muda o crédito automático; ocultar/apagar desativa a ação.
// ─────────────────────────────────────────────────────────────────────────────

export interface EarnRuleFormState {
  error?: string;
  ok?: boolean;
}

/** Cria (key vazia) ou edita (key presente) uma boa ação. */
export async function saveEarnRule(
  _prev: EarnRuleFormState,
  formData: FormData,
): Promise<EarnRuleFormState> {
  await requireAdmin();

  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "sparkles").trim() || "sparkles";
  const coins = toInt(formData.get("coins"));
  const xp = toInt(formData.get("xp"));

  // Gatilho automático de pagamento (opcional). Formatos:
  //   ""  = manual (sem gatilho) · "parcelamento" · "boleto" (qualquer boleto)
  //   "boleto:<DocType>" = boleto de um tipo específico (ex.: "boleto:mensalidade").
  const trig = String(formData.get("pay_trigger") ?? "").trim();
  let payCategoria: string | null = null;
  let payType: string | null = null;
  if (trig === "parcelamento") {
    payCategoria = "parcelamento";
  } else if (trig === "boleto") {
    payCategoria = "boleto";
  } else if (trig.startsWith("boleto:")) {
    payCategoria = "boleto";
    payType = trig.slice("boleto:".length) || null;
  }

  if (!label) return { error: "Dê um nome à ação." };
  if (coins <= 0 && xp <= 0) return { error: "Defina o ganho (SJ Coins e/ou XP)." };

  const supabase = await createClient();

  if (key) {
    const { error } = await supabase
      .from("rewards_earn_rules")
      .update({
        label,
        description,
        icon,
        coins,
        xp,
        pay_categoria: payCategoria,
        pay_type: payType,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { error: "As boas ações não estão no banco (aplique a 0022)." };
      }
      return { error: error.message };
    }
  } else {
    const { data: maxRow } = await supabase
      .from("rewards_earn_rules")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort = ((maxRow?.sort as number | undefined) ?? 0) + 1;

    const { error } = await supabase.from("rewards_earn_rules").insert({
      key: crypto.randomUUID(),
      label,
      description,
      icon,
      coins,
      xp,
      pay_categoria: payCategoria,
      pay_type: payType,
      sort,
    });
    if (error) {
      if (error.code === UNDEFINED_TABLE) {
        return { error: "As boas ações não estão no banco (aplique a 0022)." };
      }
      return { error: error.message };
    }
  }

  revalidateAdminRewards();
  return { ok: true };
}

/** Liga/desliga uma boa ação (inativa some do card E para de creditar). */
export async function setEarnRuleActive(key: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards_earn_rules")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) throw new Error(error.message);
  revalidateAdminRewards();
}

/** Apaga uma boa ação (some do card; ação automática associada deixa de creditar). */
export async function deleteEarnRule(key: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards_earn_rules")
    .delete()
    .eq("key", key);
  if (error) throw new Error(error.message);
  revalidateAdminRewards();
}
