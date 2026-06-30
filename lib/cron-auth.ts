/**
 * Autoriza uma chamada às rotas de cron (/api/cron/*).
 *
 * Em produção, só aceita o header `Authorization: Bearer <CRON_SECRET>` — é o
 * que a Vercel envia automaticamente nos jobs agendados (ver vercel.json).
 *
 * Em desenvolvimento, também aceita `?secret=<CRON_SECRET>` na URL, para testar
 * pelo navegador. Esse atalho é bloqueado em produção porque a query string
 * pode vazar em logs do servidor, no histórico do navegador e no header
 * Referer.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado: libera (conveniência em dev). Em produção,
  // configure CRON_SECRET para que a Vercel proteja a rota.
  if (!secret) return true;

  if (request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    const fromQuery = new URL(request.url).searchParams.get("secret");
    if (fromQuery === secret) return true;
  }

  return false;
}
