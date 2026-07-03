// Server-only: usa o cliente Supabase de servidor. Importar apenas de
// Server Components / server actions (nunca de Client Components).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatDayMonth } from "@/lib/format";
import {
  ACHIEVEMENTS,
  EARN_RULES,
  getMockRewardsState,
  MONTHLY_MISSIONS,
  REWARDS,
  type Achievement,
  type EarnRule,
  type IconKey,
  type LedgerEntry,
  type LevelId,
  type Mission,
  type ProgressStat,
  type Reward,
  type RewardCategory,
  type RewardsState,
} from "@/lib/rewards";

/** Postgres: relação inexistente (migration 0018 ainda não aplicada). */
const UNDEFINED_TABLE = "42P01";

/**
 * Catálogo da loja lido do banco (migration 0021). Só os prêmios ativos, na
 * ordem definida. Se a tabela ainda não existe (ou falha), usa o padrão do
 * código (`REWARDS`) para a loja nunca ficar vazia.
 */
export async function getRewardCatalog(
  supabase: SupabaseClient,
): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards_catalog")
    .select("id,name,description,icon,cost,category,requires_level")
    .eq("active", true)
    .order("sort", { ascending: true });

  if (error || !data || data.length === 0) return REWARDS;

  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? "",
    icon: (r.icon as string) as IconKey,
    cost: r.cost as number,
    category: (r.category as string) as RewardCategory,
    requiresLevel: (r.requires_level as string | null)
      ? ((r.requires_level as string) as LevelId)
      : undefined,
  }));
}

/**
 * Boas ações ("Como ganhar SJ Coins") lidas do banco (migration 0022). Só as
 * ativas, na ordem definida. Se a tabela não existe (ou falha), usa o padrão do
 * código (`EARN_RULES`).
 */
export async function getEarnRules(
  supabase: SupabaseClient,
): Promise<EarnRule[]> {
  const { data, error } = await supabase
    .from("rewards_earn_rules")
    .select("key,label,description,icon,coins,xp")
    .eq("active", true)
    .order("sort", { ascending: true });

  if (error || !data || data.length === 0) return EARN_RULES;

  return data.map((r) => ({
    id: r.key as string,
    label: r.label as string,
    description: (r.description as string | null) ?? "",
    icon: (r.icon as string) as IconKey,
    coins: r.coins as number,
    xp: r.xp as number,
  }));
}

/** Missões com progresso ainda não rastreado no banco (entra como 0). TODO. */
function missionsWithoutProgress() {
  return MONTHLY_MISSIONS.map((m) => ({ ...m, progress: 0 }));
}

/**
 * Missões criadas pelo contador (tabela rewards_missions, migration 0020) que se
 * aplicam a esta empresa — globais (company_id nulo) ou exclusivas dela — com o
 * progresso atual. Silencioso se a 0020 ainda não foi aplicada: retorna [].
 */
async function customMissionsFor(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Mission[]> {
  const { data: defs, error } = await supabase
    .from("rewards_missions")
    .select("id,title,description,icon,coins,xp,target,due_date,company_id")
    .eq("active", true)
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .order("created_at", { ascending: false });

  if (error || !defs || defs.length === 0) return [];

  const ids = defs.map((d) => d.id as string);
  const { data: prog } = await supabase
    .from("rewards_mission_progress")
    .select("mission_id,progress")
    .eq("company_id", companyId)
    .in("mission_id", ids);

  const progressByMission = new Map(
    (prog ?? []).map((p) => [p.mission_id as string, p.progress as number]),
  );

  return defs.map((d) => ({
    id: d.id as string,
    title: d.title as string,
    description: (d.description as string | null) ?? "",
    coins: d.coins as number,
    xp: d.xp as number,
    target: d.target as number,
    progress: progressByMission.get(d.id as string) ?? 0,
    icon: ((d.icon as string) || "target") as IconKey,
    tag: "Missão",
    dueLabel: d.due_date ? `até ${formatDayMonth(d.due_date as string)}` : undefined,
  }));
}

/**
 * Estado do SJ Rewards para uma empresa, lido do Supabase.
 *
 * Enquanto a migration 0018 não é aplicada, as tabelas não existem — nesse caso
 * caímos no mock (modo demonstração) para o portal não quebrar. Depois de aplicar,
 * passa a refletir os dados reais automaticamente, sem mudar nada no código.
 */
export async function getRewardsState(
  companyId: string | null,
  name: string,
): Promise<RewardsState> {
  if (!companyId) return getMockRewardsState(name);

  const supabase = await createClient();

  const { data: account, error: accErr } = await supabase
    .from("rewards_accounts")
    .select("coins,xp,streak_days")
    .eq("company_id", companyId)
    .maybeSingle();

  if (accErr) {
    if (accErr.code === UNDEFINED_TABLE) {
      console.warn(
        "[rewards] tabelas ausentes — usando dados de demonstração. Aplique supabase/migrations/0018_rewards.sql.",
      );
      return getMockRewardsState(name);
    }
    throw new Error(accErr.message);
  }

  // Empresa sem conta ainda: começa zerada (a conta é criada no 1º acesso/ação).
  // Limites do mês atual (para a missão "envie os documentos deste mês").
  const now = new Date();
  const y = now.getFullYear();
  const mIdx = now.getMonth(); // 0-based
  const mm = String(mIdx + 1).padStart(2, "0");
  const monthStart = `${y}-${mm}-01`;
  const lastDay = new Date(y, mIdx + 1, 0).getDate();
  const monthEnd = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
  // Início do mês passado (para a "Sua evolução": este mês vs. mês passado).
  const lastMonthDate = new Date(y, mIdx - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthStart = `${lastMonthKey}-01`;
  const thisMonthKey = `${y}-${mm}`;

  const [
    ledgerRes,
    achRes,
    goodActionsRes,
    missionsDoneRes,
    redeemedRes,
    requestsRes,
    customMissions,
    rewardsCatalog,
    earnRules,
    rankingRes,
  ] = await Promise.all([
      supabase
        .from("rewards_ledger")
        .select("id,label,icon,coins,xp,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("rewards_achievements")
        .select("achievement_key,unlocked_at")
        .eq("company_id", companyId),
      supabase
        .from("rewards_ledger")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gt("coins", 0),
      supabase
        .from("rewards_ledger")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("action_key", ["missao-mes", "missao"]),
      supabase
        .from("rewards_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase
        .from("document_requests")
        .select("status")
        .eq("company_id", companyId)
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd),
      customMissionsFor(supabase, companyId),
      getRewardCatalog(supabase),
      getEarnRules(supabase),
      supabase
        .from("rewards_ledger")
        .select("coins,xp,created_at")
        .eq("company_id", companyId)
        .gte("created_at", lastMonthStart),
    ]);

  const history: LedgerEntry[] = (ledgerRes.data ?? []).map((r) => ({
    id: r.id as string,
    date: String(r.created_at).slice(0, 10),
    label: r.label as string,
    icon: r.icon as IconKey,
    coins: r.coins as number,
    xp: r.xp as number,
  }));

  const unlocked = new Map(
    (achRes.data ?? []).map((r) => [
      r.achievement_key as string,
      String(r.unlocked_at).slice(0, 10),
    ]),
  );
  const achievements: Achievement[] = ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: unlocked.has(a.id),
    unlockedAt: unlocked.get(a.id),
  }));

  // Missão do mês: progresso real = solicitações enviadas / total com prazo no mês.
  const monthReqs = (requestsRes.data ?? []) as { status: string }[];
  const docMission =
    monthReqs.length > 0
      ? MONTHLY_MISSIONS.map((m) => ({
          ...m,
          progress: monthReqs.filter((r) => r.status === "submitted").length,
          target: monthReqs.length,
          dueLabel: "este mês",
        }))
      : missionsWithoutProgress();

  // Missão do mês (automática) + missões criadas pelo contador (0020).
  const missions = [...docMission, ...customMissions];

  // "Sua evolução": compara este mês com o passado, a partir do extrato real.
  const rankRows = (rankingRes.data ?? []) as {
    coins: number;
    xp: number;
    created_at: string;
  }[];
  let thisXp = 0,
    lastXp = 0,
    thisCoins = 0,
    lastCoins = 0,
    thisActs = 0,
    lastActs = 0;
  for (const r of rankRows) {
    const k = String(r.created_at).slice(0, 7);
    const cc = r.coins ?? 0;
    const xx = r.xp ?? 0;
    if (k === thisMonthKey) {
      if (xx > 0) thisXp += xx;
      if (cc > 0) {
        thisCoins += cc;
        thisActs += 1;
      }
    } else if (k === lastMonthKey) {
      if (xx > 0) lastXp += xx;
      if (cc > 0) {
        lastCoins += cc;
        lastActs += 1;
      }
    }
  }
  const rk = new Intl.NumberFormat("pt-BR");
  const ranking: ProgressStat[] = [];
  if (thisXp > 0 || lastXp > 0) {
    ranking.push({
      id: "xp-mes",
      label: "XP conquistado neste mês",
      value: `+${rk.format(thisXp)}`,
      detail: lastXp > 0 ? `Mês passado: +${rk.format(lastXp)}` : "Sua primeira marca",
      direction: thisXp >= lastXp ? "up" : "down",
      icon: "sparkles",
    });
  }
  if (thisCoins > 0 || lastCoins > 0) {
    ranking.push({
      id: "coins-mes",
      label: "SJ Coins ganhas neste mês",
      value: `+${rk.format(thisCoins)}`,
      detail:
        lastCoins > 0 ? `Mês passado: +${rk.format(lastCoins)}` : "Sua primeira marca",
      direction: thisCoins >= lastCoins ? "up" : "down",
      icon: "trending-up",
    });
  }
  if (thisActs > 0 || lastActs > 0) {
    ranking.push({
      id: "acoes-mes",
      label: "Boas ações neste mês",
      value: `${rk.format(thisActs)}`,
      detail: lastActs > 0 ? `Mês passado: ${rk.format(lastActs)}` : "Sua primeira marca",
      direction: thisActs >= lastActs ? "up" : "down",
      icon: "file-check",
    });
  }

  return {
    name,
    coins: account?.coins ?? 0,
    xp: account?.xp ?? 0,
    streakDays: account?.streak_days ?? 0,
    missionsCompleted: missionsDoneRes.count ?? 0,
    rewardsRedeemed: redeemedRes.count ?? 0,
    goodActions: goodActionsRes.count ?? 0,
    missions,
    rewards: rewardsCatalog,
    earnRules,
    history,
    achievements,
    ranking,
  };
}
