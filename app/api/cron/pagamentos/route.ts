import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { verificarPagamentosNaReceita } from "@/lib/pagamentos-receita";

export const dynamic = "force-dynamic";
// Uma consulta à Receita por empresa — dá folga para carteiras maiores.
export const maxDuration = 300;

/**
 * Job diário (Vercel Cron, ver vercel.json) — roda ANTES do /api/cron/alerts:
 * consulta na Receita os pagamentos das guias federais em aberto e marca como
 * pagas as que a Receita já mostra arrecadadas (ver lib/pagamentos-receita).
 *
 * Protegido por CRON_SECRET (igual aos outros crons). Parâmetros opcionais:
 *   ?dryRun=1        só consulta e devolve o que SERIA marcado (não grava nada)
 *   ?company=<uuid>  só uma empresa (para testar)
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const resultado = await verificarPagamentosNaReceita({
    dryRun: url.searchParams.get("dryRun") === "1",
    companyId: url.searchParams.get("company") ?? undefined,
  });

  if (resultado.falhas.length) {
    console.warn("[cron pagamentos] falhas:", JSON.stringify(resultado.falhas));
  }
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
