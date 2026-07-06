// Server-only. Monta o "contexto factual" AMPLIADO de uma empresa para a IA:
// além dos boletos/parcelamentos (já cobertos pelo assistente antigo), reúne
// faturamento, SJ Rewards e disponibilidade de folha/documentos.
//
// REGRA DE OURO (mantida do assistente original): a IA nunca acessa o banco. Aqui
// o código lê os dados do ESCOPO permitido (uma empresa, por companyId) e devolve
// um texto já formatado em pt-BR. A IA só responde com base nesse texto — não soma,
// não inventa e não vê nada fora do escopo. O escopo é imposto por parâmetro; quem
// chama valida a sessão (ver app/api/assistente/route.ts).

import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency, formatDate } from "@/lib/format";
import { getRewardsState } from "@/lib/rewards-data";
import { levelForXp } from "@/lib/rewards";
import { createAdminClient } from "@/lib/supabase/admin";

/** Blocos factuais extras (faturamento, rewards, folha/docs) de uma empresa. */
export async function blocosAmpliados(
  companyId: string,
  companyName: string,
  rewardsEnabled: boolean,
): Promise<string[]> {
  const supabase = createAdminClient();

  // Uma leitura por fonte, em paralelo. Tudo filtrado por company_id (escopo).
  const [docsFatRes, revenuesRes, folhaRes, docInstRes] = await Promise.all([
    // Faturamento: tributos vêm de documents; receita, de revenues.
    supabase
      .from("documents")
      .select("type,competencia,amount")
      .eq("company_id", companyId),
    supabase
      .from("revenues")
      .select("competencia,amount")
      .eq("company_id", companyId),
    // Folha do mês: existe documento de categoria 'folha' recente?
    supabase
      .from("documents")
      .select("competencia,created_at")
      .eq("company_id", companyId)
      .eq("categoria", "folha")
      .order("created_at", { ascending: false })
      .limit(1),
    // Documentos institucionais disponíveis (contrato social etc.).
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("categoria", "documento"),
  ]);

  const blocos: string[] = [];

  // ----- Faturamento (últimos 12 meses) -----
  const fat = buildFaturamento(
    (docsFatRes.data ?? []) as DocInput[],
    (revenuesRes.data ?? []) as RevenueInput[],
    12,
  );
  if (fat.totalFaturamento > 0 || fat.totalTributos > 0) {
    const linhas: string[] = [];
    if (fat.periodoLabel) linhas.push(`Período: ${fat.periodoLabel}`);
    linhas.push(`Faturamento no período: ${formatCurrency(fat.totalFaturamento)}`);
    linhas.push(`Tributos no período: ${formatCurrency(fat.totalTributos)}`);
    if (fat.cargaMedia !== null)
      linhas.push(`Carga tributária média: ${fat.cargaMedia.toFixed(1)}%`);
    if (fat.crescimento !== null)
      linhas.push(
        `Crescimento do último mês faturado vs. o anterior: ${fat.crescimento >= 0 ? "+" : ""}${fat.crescimento.toFixed(1)}%`,
      );
    if (fat.mediaMensal !== null)
      linhas.push(`Faturamento médio mensal: ${formatCurrency(fat.mediaMensal)}`);
    if (fat.melhorMes)
      linhas.push(
        `Melhor mês: ${fat.melhorMes.label} (${formatCurrency(fat.melhorMes.faturamento)})`,
      );
    blocos.push(`FATURAMENTO (${companyName}):\n- ${linhas.join("\n- ")}`);
  } else {
    blocos.push("FATURAMENTO: nenhum faturamento lançado ainda.");
  }

  // ----- SJ Rewards (só se ativo para a empresa) -----
  if (rewardsEnabled) {
    try {
      const st = await getRewardsState(companyId, companyName);
      const nivel = levelForXp(st.xp);
      blocos.push(
        `SJ REWARDS:\n- Saldo: ${st.coins} SJ Coins\n- Nível: ${nivel.name} (${st.xp} XP)\n- Sequência de acessos: ${st.streakDays} dia(s)\n- Missões concluídas: ${st.missionsCompleted}`,
      );
    } catch {
      // Rewards indisponível (não migrado etc.) — apenas omite o bloco.
    }
  }

  // ----- Folha do mês -----
  const folha = folhaRes.data?.[0] as
    | { competencia: string | null; created_at: string }
    | undefined;
  if (folha) {
    const ref = folha.competencia ?? formatDate(folha.created_at);
    blocos.push(`FOLHA: disponível (competência ${ref}).`);
  } else {
    blocos.push("FOLHA: nenhuma folha disponível no momento.");
  }

  // ----- Documentos institucionais -----
  const docsCount = docInstRes.count ?? 0;
  blocos.push(
    docsCount > 0
      ? `DOCUMENTOS: ${docsCount} documento(s) institucional(is) disponível(is) para consulta.`
      : "DOCUMENTOS: nenhum documento institucional disponível.",
  );

  return blocos;
}
