// Server-only. Monta as boas-vindas da aba "Converse com sua empresa": uma
// saudação por horário + os "achados do dia" (vencimentos próximos, folha nova,
// crescimento, SJ Rewards). É o que faz o chat NUNCA abrir vazio.
//
// Tudo lido por company_id (escopo preservado). Puro resumo factual — nenhuma
// chamada à IA aqui; a saudação é montada em código (rápido, sem custo).

import { buildFaturamento, type DocInput, type RevenueInput } from "@/lib/faturamento";
import { getUrgency } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { getRewardsState } from "@/lib/rewards-data";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BoasVindas {
  /** "Bom dia" | "Boa tarde" | "Boa noite" — conforme o horário no fuso BR. */
  saudacao: string;
  /** Nome da empresa (para personalizar). */
  empresa: string;
  /** Linhas de destaque do dia (cada uma já formatada, com emoji). Pode ser []. */
  achados: string[];
}

/** Saudação conforme a hora no fuso de São Paulo. */
export function saudacaoPorHorario(now = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Reúne os destaques do dia de uma empresa. Ordem pensada para o cliente: o que
 * exige ação (vencimentos) primeiro, depois novidades boas (folha, crescimento,
 * rewards). Só entram itens verdadeiros — nada de "0 pendências" forçado.
 */
export async function getBoasVindas(
  companyId: string,
  companyName: string,
  rewardsEnabled: boolean,
  now = new Date(),
): Promise<BoasVindas> {
  const supabase = createAdminClient();

  const [guiasRes, docsFatRes, revenuesRes, folhaRes] = await Promise.all([
    // Guias a pagar em aberto (para o próximo vencimento).
    supabase
      .from("documents")
      .select("type,amount,due_date,status,categoria")
      .eq("company_id", companyId)
      .in("categoria", ["boleto", "parcelamento"])
      .eq("status", "open"),
    // Faturamento (crescimento).
    supabase
      .from("documents")
      .select("type,competencia,amount")
      .eq("company_id", companyId),
    supabase
      .from("revenues")
      .select("competencia,amount")
      .eq("company_id", companyId),
    // Folha mais recente.
    supabase
      .from("documents")
      .select("competencia,created_at")
      .eq("company_id", companyId)
      .eq("categoria", "folha")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const achados: string[] = [];

  // ----- Próximo vencimento / vencidos -----
  const guias = (guiasRes.data ?? []) as Array<{
    amount: number | null;
    due_date: string | null;
    status: "open";
  }>;
  let vencidos = 0;
  let proxDue: string | null = null;
  let proxValor = 0;
  for (const g of guias) {
    if (!g.due_date) continue;
    const { urgency } = getUrgency(g.due_date, "open", now);
    if (urgency === "vencido") {
      vencidos++;
    } else if (!proxDue || g.due_date < proxDue) {
      proxDue = g.due_date;
      proxValor = g.amount ?? 0;
    }
  }
  if (vencidos > 0) {
    achados.push(
      `⚠️ Você tem ${vencidos} guia(s) vencida(s) em aberto — vale regularizar.`,
    );
  }
  if (proxDue) {
    const dias = Math.ceil(
      (new Date(proxDue).getTime() - now.getTime()) / 86_400_000,
    );
    const quando =
      dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
    achados.push(
      `📅 Sua próxima guia vence ${quando} (${formatDate(proxDue)}) — ${formatCurrency(proxValor)}.`,
    );
  } else if (vencidos === 0) {
    achados.push("✔️ Nenhuma guia a vencer no momento.");
  }

  // ----- Crescimento do faturamento -----
  const fat = buildFaturamento(
    (docsFatRes.data ?? []) as DocInput[],
    (revenuesRes.data ?? []) as RevenueInput[],
    12,
  );
  if (fat.crescimento !== null && fat.crescimento !== 0) {
    const sinal = fat.crescimento > 0 ? "cresceu" : "caiu";
    achados.push(
      `📈 Seu faturamento ${sinal} ${Math.abs(fat.crescimento).toFixed(0)}% no último mês.`,
    );
  }

  // ----- Folha nova -----
  const folha = folhaRes.data?.[0] as
    | { competencia: string | null }
    | undefined;
  if (folha) {
    achados.push(
      `📄 Sua folha${folha.competencia ? ` (${folha.competencia})` : ""} está disponível.`,
    );
  }

  // ----- SJ Rewards -----
  if (rewardsEnabled) {
    try {
      const st = await getRewardsState(companyId, companyName);
      if (st.coins > 0) {
        achados.push(`🏆 Você tem ${st.coins} SJ Coins acumulados.`);
      }
    } catch {
      // rewards indisponível — omite.
    }
  }

  return {
    saudacao: saudacaoPorHorario(now),
    empresa: companyName,
    achados,
  };
}
