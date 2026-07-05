/**
 * Rate-limit simples em memória, por chave (ex.: id do usuário).
 * Objetivo: proteger a conta OpenAI de abuso/custo — um usuário não dispara
 * dezenas de perguntas por minuto.
 *
 * Limitação conhecida: o estado é por instância do servidor (não compartilhado
 * entre lambdas da Vercel). Para o volume atual é suficiente como um "freio"; se
 * um dia precisar de limite global exato, migrar para Supabase/Upstash.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number; // segundos até liberar (0 quando permitido)
}

/**
 * Consome 1 uso da chave. Permite até `max` usos por janela de `windowMs`.
 */
export function rateLimit(
  key: string,
  max = 8,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (b.count < max) {
    b.count++;
    return { allowed: true, retryAfterSec: 0 };
  }

  return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}
