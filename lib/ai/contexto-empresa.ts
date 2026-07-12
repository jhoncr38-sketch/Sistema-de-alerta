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
  TRIBUTO_GROUPS,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { docTypeLabel, isTributo } from "@/lib/constants";
import type { DocType } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

// Grupos do gráfico (chaves de porTipo) que são IMPOSTO (entram na carga:
// DAS/DARFs/ISS/ICMS). Derivado de TRIBUTO_GROUPS + isTributo para não
// dessincronizar se um tipo novo for adicionado. Ex.: "inss"/"fgts" ficam de fora.
const GRUPOS_IMPOSTO = new Set(
  TRIBUTO_GROUPS.filter((g) => g.types.some((t) => isTributo(t))).map((g) => g.key),
);
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
  const [docsFatRes, revenuesRes, folhaRes, docInstRes, sitfisRes] =
    await Promise.all([
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
    // Documentos institucionais disponíveis (contrato social, alvará, cartão
    // CNPJ etc.). Traz tipo + descrição para LISTAR pelo nome — a IA precisa
    // saber quais existem para responder "quero meu contrato social".
    supabase
      .from("documents")
      .select("type,descricao,competencia,created_at")
      .eq("company_id", companyId)
      .eq("categoria", "documento")
      .order("created_at", { ascending: false }),
    // Último relatório de situação fiscal publicado (com o resumo por IA na
    // descrição, quando houve). É a fonte da situação fiscal para o chat.
    supabase
      .from("documents")
      .select("descricao,created_at")
      .eq("company_id", companyId)
      .eq("type", "relatorio_fiscal")
      .order("created_at", { ascending: false })
      .limit(1),
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
    // Série por COMPETÊNCIA (mês a que as guias se referem), com TOTAL do mês e
    // a composição (imposto + encargo). Imposto = carga (DAS/DARFs/ISS/ICMS);
    // encargo = INSS, FGTS, ISS-RPA e Outro. O total por mês = altura da barra
    // do gráfico "Tributos por tipo". O total já vem pronto para a IA não somar.
    const linhasTributos = fat.data
      .map((p) => {
        let imposto = 0;
        let encargo = 0;
        for (const [grupo, v] of Object.entries(p.porTipo)) {
          if (GRUPOS_IMPOSTO.has(grupo)) imposto += v;
          else encargo += v;
        }
        return { label: p.label, imposto, encargo, total: imposto + encargo };
      })
      .filter((p) => p.total > 0)
      .map((p) => {
        const comp =
          p.encargo > 0
            ? `${formatCurrency(p.imposto)} de imposto + ${formatCurrency(p.encargo)} de encargos (INSS/FGTS)`
            : `${formatCurrency(p.imposto)} de imposto`;
        return `${p.label}: total ${formatCurrency(p.total)} (${comp})`;
      });
    if (linhasTributos.length) {
      linhas.push(
        `Por mês, por COMPETÊNCIA (mês a que as guias se referem). O "total" é imposto + encargos e é a altura da barra do gráfico "Tributos por tipo". Imposto = carga (DAS/DARFs/ISS/ICMS); INSS/FGTS são ENCARGOS. Ao responder sobre um mês, informe o total E detalhe quanto é imposto e quanto é encargo; ao comparar meses, compare pelo total. Só os meses abaixo têm dado lançado; mês que não estiver na lista ainda não tem imposto/faturamento:\n  - ${linhasTributos.join("\n  - ")}`,
      );
    }
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
  // Lista pelo NOME (não só a contagem): assim a IA reconhece pedidos como
  // "quero meu contrato social" e diz se ele está disponível — ou, se não
  // estiver, quais documentos o cliente de fato tem no portal.
  const docsInst = (docInstRes.data ?? []) as {
    type: DocType;
    descricao: string | null;
    competencia: string | null;
    created_at: string;
  }[];
  if (docsInst.length > 0) {
    const linhasDoc = docsInst.map((d) => {
      // Nome amigável: descrição livre (tipo "Outro") tem prioridade; senão o
      // rótulo do tipo. Sem duplicar quando a descrição é só o rótulo padrão.
      const rotulo = docTypeLabel(d.type);
      const desc = d.descricao?.trim();
      const nome = desc && desc !== rotulo ? desc : rotulo;
      const ref = d.competencia ? ` (competência ${d.competencia})` : "";
      return `${nome}${ref}`;
    });
    blocos.push(
      `DOCUMENTOS institucionais disponíveis no portal (o cliente encontra em Documentos):\n- ${linhasDoc.join("\n- ")}\nSe o cliente pedir um documento que ESTÁ nesta lista, confirme que está disponível e oriente-o a abrir a aba Documentos para baixá-lo. Se pedir um que NÃO está na lista (ex.: contrato social quando só há aditivo), diga que não localizou esse documento específico, liste o que há disponível e sugira pedir ao contador.`,
    );
  } else {
    blocos.push(
      "DOCUMENTOS: nenhum documento institucional disponível no portal. Se o cliente pedir um documento (contrato social etc.), oriente-o a solicitar ao contador.",
    );
  }

  // ----- Situação fiscal na Receita (do último relatório publicado) -----
  const sitfis = sitfisRes.data?.[0] as
    | { descricao: string | null; created_at: string }
    | undefined;
  const DESC_PADRAO = "Relatório de situação fiscal (Receita Federal)";
  if (sitfis?.descricao && sitfis.descricao.trim() !== DESC_PADRAO) {
    // Há um resumo por IA salvo — reaproveita como a "verdade" da situação fiscal.
    blocos.push(
      `SITUAÇÃO FISCAL (Receita Federal, relatório de ${formatDate(sitfis.created_at)}):\n${sitfis.descricao.trim()}`,
    );
  } else if (sitfis) {
    blocos.push(
      `SITUAÇÃO FISCAL: há um relatório de situação fiscal publicado (${formatDate(sitfis.created_at)}). Para detalhes, o cliente deve abri-lo em Documentos.`,
    );
  } else {
    blocos.push(
      "SITUAÇÃO FISCAL: não há relatório de situação fiscal publicado. Se o cliente perguntar sobre pendências na Receita, oriente-o a pedir ao contador para gerar o relatório.",
    );
  }

  return blocos;
}
