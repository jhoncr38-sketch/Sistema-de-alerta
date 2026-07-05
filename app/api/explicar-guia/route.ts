import { NextResponse } from "next/server";
import { explicarTipo } from "@/lib/ai/explicacao";
import { rateLimit } from "@/lib/ai/rate-limit";
import { getUserAndProfile } from "@/lib/auth";
import { DOC_TYPE_LABELS } from "@/lib/constants";
import type { DocType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Explica um TIPO de guia em linguagem simples (POST). Alimenta o botão
 * "O que é isso?" no portal do cliente.
 *
 * A explicação é conhecimento geral sobre o imposto (não depende de dados de
 * nenhuma empresa), então basta o usuário estar autenticado e ativo. O texto
 * fica em cache por tipo (ver lib/ai/explicacao.ts), então quase sempre a
 * resposta sai do banco, sem chamar a IA.
 *
 * Corpo: { type: DocType }. Resposta: { texto: string }.
 */
export async function POST(request: Request) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Acesso desativado." }, { status: 403 });
  }

  let type = "";
  try {
    const body = (await request.json()) as { type?: unknown };
    if (typeof body.type === "string") type = body.type;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // Só aceita um tipo conhecido — evita gerar texto para entrada arbitrária.
  if (!(type in DOC_TYPE_LABELS)) {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }

  // Freio por usuário (protege custo da OpenAI em picos; o cache já cobre o
  // caso normal, isto barra só a explosão de tipos novos por um mesmo usuário).
  const rl = rateLimit(`explicar:${user.id}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Muitas solicitações. Aguarde ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  try {
    const { texto } = await explicarTipo(type as DocType);
    return NextResponse.json({ texto });
  } catch (err) {
    console.error("[explicar-guia] erro:", err);
    return NextResponse.json(
      { error: "Não consegui carregar a explicação." },
      { status: 500 },
    );
  }
}
