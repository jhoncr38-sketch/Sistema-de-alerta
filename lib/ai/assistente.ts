import { chatComplete, isAiConfigured } from "@/lib/ai/openai";
import { blocosAmpliados } from "@/lib/ai/contexto-empresa";
import { docTypeLabel, isTributo } from "@/lib/constants";
import { getUrgency } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

/**
 * Tela em que o cliente está quando pergunta. Ajusta o foco da resposta e as
 * sugestões — a IA "sabe" o contexto da página. "geral" é a aba dedicada / sem
 * tela específica.
 */
export type TelaContexto =
  | "geral"
  | "boletos"
  | "faturamento"
  | "documentos"
  | "folha"
  | "rewards"
  | "parcelamentos";

/**
 * Assistente de dúvidas em linguagem natural.
 *
 * REGRA DE OURO (privacidade + confiança): a IA nunca acessa o banco. O código
 * busca os dados do ESCOPO permitido (a empresa do cliente, ou todas as
 * empresas para o contador), monta um "contexto factual" já formatado em pt-BR
 * e a IA apenas responde a pergunta com base nesse contexto. Ela não soma,
 * não inventa valores e não vê dados fora do escopo.
 *
 * O acesso ao banco aqui usa o service role, mas o ESCOPO é imposto por
 * parâmetro (companyId do cliente) — o endpoint que chama isto é quem valida a
 * sessão e decide o escopo. Ver app/api/assistente/route.ts.
 */

/** Guia mínima usada para montar o contexto. */
interface DocCtx {
  company_id: string;
  type: DocType;
  categoria: "boleto" | "documento" | "folha" | "parcelamento";
  amount: number | null;
  due_date: string | null;
  status: "open" | "aguardando" | "paid";
  marcado_pago_at: string | null;
  paid_at: string | null;
  parcela_num: number | null; // nº da parcela no plano (só em parcelamento)
  plan: { nome: string; total: number } | null; // plano ao qual a parcela pertence
}

/** Colunas buscadas em documents (inclui o plano da parcela). */
const DOC_SELECT =
  "company_id,type,categoria,amount,due_date,status,marcado_pago_at,paid_at,parcela_num,plan:installment_plans(nome,total)";

/**
 * Normaliza o retorno cru do Supabase em DocCtx[]. O join `plan` pode vir como
 * array (comportamento do PostgREST) — aqui reduzimos ao primeiro elemento.
 */
function normalizeDocs(rows: unknown): DocCtx[] {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map((r) => {
    const row = r as Record<string, unknown>;
    const planRaw = row.plan;
    const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
    return {
      ...(row as object),
      plan: (plan as DocCtx["plan"]) ?? null,
    } as DocCtx;
  });
}

/**
 * Rótulo de uma guia no contexto. Parcela de parcelamento vira
 * "Parcela 3/33 do <plano>"; guia comum usa o tipo do imposto.
 */
function rotuloGuia(d: DocCtx): string {
  if (d.categoria === "parcelamento" && d.plan) {
    const num = d.parcela_num ?? "?";
    return `Parcela ${num}/${d.plan.total} do parcelamento "${d.plan.nome}"`;
  }
  return docTypeLabel(d.type);
}

const MAX_PERGUNTA = 300; // caracteres — evita prompt gigante/custo

/** Mês atual "YYYY-MM" no fuso do Brasil. */
function mesAtual(today = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(today);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function isoDay(v: string): string {
  return v.split("T")[0];
}

/** Resultado da pergunta. `disponivel=false` => IA não configurada. */
export interface AssistenteResposta {
  disponivel: boolean;
  resposta: string | null;
}

// ---------------------------------------------------------------------------
// Contexto do CLIENTE: guias da empresa dele.
// ---------------------------------------------------------------------------
function contextoCliente(
  docs: DocCtx[],
  companyName: string,
  today: Date,
): string {
  const mes = mesAtual(today);
  const abertas: string[] = [];
  const atrasadas: string[] = [];
  const aguardando: string[] = [];
  let pagasMesQtd = 0;
  let pagasMesValor = 0;
  let tributosMesValor = 0;
  let pagasAnoValor = 0;
  const ano = mes.slice(0, 4);

  // Progresso dos parcelamentos: por plano, quantas parcelas pagas de quantas.
  const planos = new Map<
    string,
    { nome: string; total: number; pagas: number; proxVenc: string | null }
  >();

  for (const d of docs) {
    const pagavel = d.categoria === "boleto" || d.categoria === "parcelamento";
    if (!pagavel) continue;
    const valor = d.amount ?? 0;
    const nome = rotuloGuia(d);

    // Acumula o progresso do plano (independente do status da parcela).
    if (d.categoria === "parcelamento" && d.plan) {
      const key = `${d.plan.nome}|${d.plan.total}`;
      const p = planos.get(key) ?? {
        nome: d.plan.nome,
        total: d.plan.total,
        pagas: 0,
        proxVenc: null,
      };
      if (d.status === "paid") p.pagas++;
      else if (d.due_date && (!p.proxVenc || d.due_date < p.proxVenc)) {
        p.proxVenc = d.due_date;
      }
      planos.set(key, p);
    }

    if (d.status === "paid") {
      const ref = d.marcado_pago_at ?? d.paid_at;
      if (ref) {
        const day = isoDay(ref);
        if (day.slice(0, 7) === mes) {
          pagasMesQtd++;
          pagasMesValor += valor;
          if (isTributo(d.type)) tributosMesValor += valor;
        }
        if (day.slice(0, 4) === ano) pagasAnoValor += valor;
      }
      continue;
    }

    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status, today);
    const linha = `${nome} — ${formatCurrency(valor)}, vence ${formatDate(d.due_date)}`;
    if (d.status === "aguardando") {
      aguardando.push(`${linha} (aguardando confirmação do contador)`);
    } else if (urgency === "vencido") {
      atrasadas.push(`${linha} (VENCIDO)`);
    } else {
      abertas.push(linha);
    }
  }

  const partes: string[] = [`Empresa: ${companyName}`, `Mês atual: ${mes}`];

  partes.push(
    atrasadas.length
      ? `Guias VENCIDAS em aberto (${atrasadas.length}):\n- ${atrasadas.join("\n- ")}`
      : "Guias vencidas em aberto: nenhuma.",
  );
  partes.push(
    abertas.length
      ? `Guias a vencer em aberto (${abertas.length}):\n- ${abertas.join("\n- ")}`
      : "Guias a vencer em aberto: nenhuma.",
  );
  if (aguardando.length) {
    partes.push(
      `Guias aguardando confirmação (${aguardando.length}):\n- ${aguardando.join("\n- ")}`,
    );
  }
  if (planos.size > 0) {
    const linhasPlano = Array.from(planos.values()).map((p) => {
      const prox =
        p.pagas >= p.total
          ? "quitado"
          : p.proxVenc
            ? `próxima parcela vence ${formatDate(p.proxVenc)}`
            : "sem próxima parcela definida";
      return `"${p.nome}": ${p.pagas} de ${p.total} parcelas pagas, ${prox}`;
    });
    partes.push(
      `Parcelamentos (${planos.size}):\n- ${linhasPlano.join("\n- ")}`,
    );
  } else {
    partes.push("Parcelamentos: nenhum cadastrado.");
  }
  partes.push(
    `Pagas no mês atual: ${pagasMesQtd} guia(s), total ${formatCurrency(pagasMesValor)} (dos quais ${formatCurrency(tributosMesValor)} em impostos).`,
  );
  partes.push(`Total pago no ano de ${ano}: ${formatCurrency(pagasAnoValor)}.`);

  return partes.join("\n\n");
}

// ---------------------------------------------------------------------------
// Contexto do CONTADOR: panorama agregado por empresa (todas).
// ---------------------------------------------------------------------------
function contextoContador(
  docs: DocCtx[],
  nomesPorEmpresa: Map<string, string>,
  today: Date,
): string {
  const mes = mesAtual(today);
  interface Agg {
    nome: string;
    vencidas: number;
    vencidasValor: number;
    venceHoje: number;
    aVencer7: number;
    aVencer7Valor: number;
    aguardando: number;
    pagasMesValor: number;
    parcelasRisco: number; // parcelas de parcelamento vencidas (risco de exclusão)
  }
  const byCompany = new Map<string, Agg>();
  const get = (id: string): Agg => {
    let a = byCompany.get(id);
    if (!a) {
      a = {
        nome: nomesPorEmpresa.get(id) ?? "—",
        vencidas: 0,
        vencidasValor: 0,
        venceHoje: 0,
        aVencer7: 0,
        aVencer7Valor: 0,
        aguardando: 0,
        pagasMesValor: 0,
        parcelasRisco: 0,
      };
      byCompany.set(id, a);
    }
    return a;
  };

  for (const d of docs) {
    const pagavel = d.categoria === "boleto" || d.categoria === "parcelamento";
    if (!pagavel) continue;
    const valor = d.amount ?? 0;
    const a = get(d.company_id);

    if (d.status === "paid") {
      const ref = d.marcado_pago_at ?? d.paid_at;
      if (ref && isoDay(ref).slice(0, 7) === mes) a.pagasMesValor += valor;
      continue;
    }
    if (d.status === "aguardando") {
      a.aguardando++;
      continue;
    }
    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status, today);
    if (urgency === "vencido") {
      a.vencidas++;
      a.vencidasValor += valor;
      // Parcela de parcelamento vencida = risco de exclusão do parcelamento.
      if (d.categoria === "parcelamento") a.parcelasRisco++;
    } else if (urgency === "vence_hoje") {
      a.venceHoje++;
      a.aVencer7++;
      a.aVencer7Valor += valor;
    } else if (urgency === "proximos_3" || urgency === "proximos_7") {
      a.aVencer7++;
      a.aVencer7Valor += valor;
    }
  }

  // Só empresas com algo relevante; ordena por vencidas desc.
  const linhas = Array.from(byCompany.values())
    .filter(
      (a) => a.vencidas || a.aVencer7 || a.aguardando || a.pagasMesValor,
    )
    .sort((a, b) => b.vencidas - a.vencidas || b.aVencer7 - a.aVencer7)
    .map((a) => {
      const campos: string[] = [];
      if (a.vencidas)
        campos.push(`${a.vencidas} vencida(s) = ${formatCurrency(a.vencidasValor)}`);
      if (a.venceHoje) campos.push(`${a.venceHoje} vence(m) hoje`);
      if (a.aVencer7)
        campos.push(`${a.aVencer7} a vencer em 7 dias = ${formatCurrency(a.aVencer7Valor)}`);
      if (a.parcelasRisco)
        campos.push(
          `${a.parcelasRisco} parcela(s) de parcelamento vencida(s) — risco de exclusão`,
        );
      if (a.aguardando) campos.push(`${a.aguardando} aguardando confirmação`);
      if (a.pagasMesValor)
        campos.push(`pago no mês ${formatCurrency(a.pagasMesValor)}`);
      return `${a.nome}: ${campos.join("; ")}`;
    });

  if (linhas.length === 0) {
    return `Mês atual: ${mes}\n\nNenhuma pendência ou pagamento relevante entre as empresas no momento.`;
  }
  return `Mês atual: ${mes}\nPanorama por empresa (todas as empresas ativas):\n- ${linhas.join("\n- ")}`;
}

// ---------------------------------------------------------------------------
// Chamada à IA
// ---------------------------------------------------------------------------
function systemPrompt(escopo: "cliente" | "contador"): string {
  const base =
    "Você é o assistente virtual da ContAlert, um portal de obrigações " +
    "contábeis (boletos, impostos e parcelamentos). Responda em português do " +
    "Brasil, de forma curta, direta e cordial. Use SOMENTE os dados do CONTEXTO " +
    "abaixo — nunca invente, estime ou calcule valores que não estejam lá. Se a " +
    "informação não estiver no contexto, diga que não tem esse dado e sugira " +
    "falar com o contador. Não dê consultoria fiscal nem opinião jurídica. " +
    "Valores em reais, datas no formato dia/mês/ano. Não use markdown pesado; " +
    "listas curtas são bem-vindas quando ajudarem.";
  if (escopo === "contador") {
    return (
      base +
      " Você fala com o CONTADOR (visão de todas as empresas). Pode citar nomes " +
      "de empresas presentes no contexto."
    );
  }
  return (
    base +
    " Você fala com o CLIENTE sobre a empresa dele. Nunca mencione outras empresas."
  );
}

/** Dica de foco conforme a tela em que o cliente está (parte do system prompt). */
function focoDaTela(tela: TelaContexto): string {
  switch (tela) {
    case "boletos":
      return " O cliente está na tela de BOLETOS: priorize guias a pagar, vencimentos e valores.";
    case "faturamento":
      return " O cliente está na tela de FATURAMENTO: priorize receita, tributos, carga e tendências (crescimento).";
    case "documentos":
      return " O cliente está na tela de DOCUMENTOS: priorize documentos disponíveis e onde encontrá-los.";
    case "folha":
      return " O cliente está na tela de FOLHA: priorize a folha de pagamento e sua disponibilidade.";
    case "rewards":
      return " O cliente está na tela de SJ REWARDS: priorize saldo de SJ Coins, nível, XP e missões.";
    case "parcelamentos":
      return " O cliente está na tela de PARCELAMENTOS: priorize planos, parcelas pagas/a vencer e risco.";
    default:
      return "";
  }
}

/** Sugestões contextuais por tela (client scope). Cai nas gerais quando não há tela. */
export function sugestoesPorTela(tela: TelaContexto): string[] {
  switch (tela) {
    case "boletos":
      return ["Qual boleto vence primeiro?", "Tenho algo vencido?", "Quanto devo este mês?"];
    case "faturamento":
      return ["Como está meu faturamento?", "Meu faturamento cresceu?", "Qual minha carga tributária?"];
    case "documentos":
      return ["Quais documentos tenho disponíveis?", "Meu contrato social está aqui?"];
    case "folha":
      return ["Minha folha já está pronta?", "De qual mês é a folha disponível?"];
    case "rewards":
      return ["Quanto tenho no SJ Rewards?", "Qual meu nível?", "Quais missões faltam?"];
    case "parcelamentos":
      return ["Como estão meus parcelamentos?", "Qual parcela vence agora?"];
    default:
      return [
        "Quanto paguei de imposto este ano?",
        "Tenho boletos vencidos?",
        "Como está meu faturamento?",
      ];
  }
}

/** Sugestões de perguntas exibidas na interface (por escopo). */
export function sugestoes(escopo: "cliente" | "contador"): string[] {
  if (escopo === "contador") {
    return [
      "Quais clientes têm boleto vencido?",
      "Quem tem guias a vencer esta semana?",
      "Há pagamentos aguardando minha confirmação?",
    ];
  }
  return [
    "Qual boleto vence primeiro?",
    "Tenho algo vencido?",
    "Quanto paguei de imposto este mês?",
  ];
}

/**
 * Responde uma pergunta do cliente (escopo: 1 empresa).
 * `companyId`/`companyName` já validados pelo endpoint.
 */
export async function perguntarCliente(
  pergunta: string,
  companyId: string,
  companyName: string,
  tela: TelaContexto = "geral",
  today: Date = new Date(),
): Promise<AssistenteResposta> {
  if (!isAiConfigured()) return { disponivel: false, resposta: null };
  const q = pergunta.trim().slice(0, MAX_PERGUNTA);
  if (!q) return { disponivel: true, resposta: "Faça uma pergunta 🙂" };

  const supabase = createAdminClient();
  // Guias (para o bloco de boletos/parcelamentos) + flag de rewards da empresa.
  const [{ data }, { data: company }] = await Promise.all([
    supabase
      .from("documents")
      .select(DOC_SELECT)
      .eq("company_id", companyId)
      .in("categoria", ["boleto", "parcelamento"]),
    supabase
      .from("companies")
      .select("rewards_enabled")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  // Contexto = boletos/parcelamentos (como antes) + faturamento, rewards e
  // folha/documentos. Assim a IA responde sobre a empresa toda, não só guias.
  const rewardsEnabled = company?.rewards_enabled !== false;
  const blocoGuias = contextoCliente(normalizeDocs(data), companyName, today);
  const extras = await blocosAmpliados(companyId, companyName, rewardsEnabled);
  const ctx = [blocoGuias, ...extras].join("\n\n");

  const resposta = await chatComplete(
    [
      { role: "system", content: systemPrompt("cliente") + focoDaTela(tela) },
      { role: "user", content: `CONTEXTO:\n${ctx}\n\nPERGUNTA: ${q}` },
    ],
    { temperature: 0.2, maxTokens: 400 },
  );

  return {
    disponivel: true,
    resposta:
      resposta ??
      "Não consegui responder agora. Tente novamente em instantes ou fale com seu contador.",
  };
}

/**
 * Responde uma pergunta do contador (escopo: todas as empresas ativas).
 */
export async function perguntarContador(
  pergunta: string,
  today: Date = new Date(),
): Promise<AssistenteResposta> {
  if (!isAiConfigured()) return { disponivel: false, resposta: null };
  const q = pergunta.trim().slice(0, MAX_PERGUNTA);
  if (!q) return { disponivel: true, resposta: "Faça uma pergunta 🙂" };

  const supabase = createAdminClient();
  const [{ data: docs }, { data: companies }] = await Promise.all([
    supabase
      .from("documents")
      .select(DOC_SELECT)
      .in("categoria", ["boleto", "parcelamento"]),
    supabase.from("companies").select("id,razao_social,nome_fantasia").eq("active", true),
  ]);

  const nomes = new Map<string, string>();
  for (const c of (companies ?? []) as {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
  }[]) {
    nomes.set(c.id, c.nome_fantasia || c.razao_social || "—");
  }

  const ctx = contextoContador(normalizeDocs(docs), nomes, today);
  const resposta = await chatComplete(
    [
      { role: "system", content: systemPrompt("contador") },
      { role: "user", content: `CONTEXTO:\n${ctx}\n\nPERGUNTA: ${q}` },
    ],
    { temperature: 0.2, maxTokens: 500 },
  );

  return {
    disponivel: true,
    resposta:
      resposta ??
      "Não consegui responder agora. Tente novamente em instantes.",
  };
}
