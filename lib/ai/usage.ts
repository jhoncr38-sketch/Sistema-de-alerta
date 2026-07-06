// Server-only. Teto MENSAL de uso da IA por empresa (controle de custo).
// Antes de cada chamada à OpenAI, o endpoint chama consumirUsoIA(): a função
// atômica ai_check_and_count (migration 0034) confere o teto da empresa e, se
// houver espaço, consome 1 uso. Ao atingir o teto, o portal NÃO chama a OpenAI
// (custo zero) e mostra uma mensagem — renova no dia 1º.

import { createAdminClient } from "@/lib/supabase/admin";

// Padrão global de perguntas/mês por empresa quando companies.ai_monthly_limit
// é NULL. Ajustável por env sem mexer no código. 0/negativo = sem padrão (então
// empresas NULL ficariam ilimitadas — evite; deixe um número).
export const AI_DEFAULT_LIMIT = Number(
  process.env.AI_MONTHLY_LIMIT ?? "150",
);

// Códigos Postgres de "migration 0034 ainda não aplicada" — nesse caso NÃO
// bloqueia (fail-open): o recurso segue funcionando como antes do teto.
const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

export interface UsoIA {
  allowed: boolean;
  used: number;
  limit: number; // 0 = ilimitado
  remaining: number; // -1 = ilimitado
}

/** Mês corrente "YYYY-MM" no fuso do Brasil (alinha o reset ao calendário local). */
function mesAtualBR(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/**
 * Consome 1 uso da IA para a empresa no mês atual (atômico no banco). Devolve se
 * está liberado e quanto resta. Fail-open: se a migration não existe ou a RPC
 * falha, LIBERA (não trava o recurso por causa da infra do teto).
 */
export async function consumirUsoIA(companyId: string): Promise<UsoIA> {
  const liberadoSemLimite: UsoIA = {
    allowed: true,
    used: 0,
    limit: 0,
    remaining: -1,
  };
  if (!companyId) return liberadoSemLimite;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("ai_check_and_count", {
    c: companyId,
    p_month: mesAtualBR(),
    p_default: AI_DEFAULT_LIMIT,
  });

  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      // Teto ainda não migrado — segue como antes (sem limite).
      return liberadoSemLimite;
    }
    // Falha inesperada: não punir o cliente por erro de infra — libera.
    console.error("[ai-usage] ai_check_and_count:", error.message);
    return liberadoSemLimite;
  }

  const r = (data ?? {}) as Partial<UsoIA>;
  return {
    allowed: r.allowed ?? true,
    used: r.used ?? 0,
    limit: r.limit ?? 0,
    remaining: r.remaining ?? -1,
  };
}
