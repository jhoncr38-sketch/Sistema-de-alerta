import { NextResponse } from "next/server";
import {
  perguntarCliente,
  perguntarContador,
  type TelaContexto,
} from "@/lib/ai/assistente";
import { rateLimit } from "@/lib/ai/rate-limit";
import { consumirUsoIA } from "@/lib/ai/usage";
import { getUserAndProfile } from "@/lib/auth";
import { getClientCompanyContext } from "@/lib/companies";

/** Telas aceitas no body (valida a entrada do cliente antes de repassar). */
const TELAS_VALIDAS = new Set<string>([
  "geral",
  "boletos",
  "faturamento",
  "documentos",
  "folha",
  "rewards",
  "parcelamentos",
]);

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Assistente de dúvidas (POST). Valida a sessão, define o ESCOPO pela role
 * (cliente = empresa ativa dele; contador = todas as empresas) e responde.
 *
 * Segurança:
 *  - exige usuário autenticado (401 se não houver);
 *  - o cliente só recebe dados da própria empresa ativa (nunca de outras);
 *  - rate-limit por usuário protege a conta OpenAI de abuso/custo.
 *
 * Corpo: { pergunta: string }. Resposta: { resposta: string } ou
 * { disponivel: false } quando a IA não está configurada.
 */
export async function POST(request: Request) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Acesso desativado." }, { status: 403 });
  }

  let pergunta = "";
  let tela: TelaContexto = "geral";
  try {
    const body = (await request.json()) as {
      pergunta?: unknown;
      tela?: unknown;
    };
    if (typeof body.pergunta === "string") pergunta = body.pergunta;
    if (typeof body.tela === "string" && TELAS_VALIDAS.has(body.tela)) {
      tela = body.tela as TelaContexto;
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!pergunta.trim()) {
    return NextResponse.json({ error: "Pergunta vazia." }, { status: 400 });
  }

  // Freio por usuário (protege custo da OpenAI).
  const rl = rateLimit(`assistente:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Muitas perguntas em pouco tempo. Aguarde ${rl.retryAfterSec}s e tente de novo.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  try {
    if (profile.role === "admin") {
      const r = await perguntarContador(pergunta);
      return NextResponse.json(r);
    }

    // Cliente: escopo = empresa ativa (a mesma que ele vê no portal).
    const { active } = await getClientCompanyContext();
    if (!active) {
      return NextResponse.json({
        disponivel: true,
        resposta:
          "Você ainda não tem uma empresa vinculada. Fale com seu contador.",
      });
    }

    // Teto MENSAL por empresa (só para o cliente; o contador não conta). Se
    // estourou, não chama a OpenAI (custo zero).
    const uso = await consumirUsoIA(active.id);
    if (!uso.allowed) {
      return NextResponse.json(
        {
          error:
            "Você atingiu o limite de perguntas deste mês. Ele renova no início do próximo mês — ou fale com seu contador.",
        },
        { status: 429 },
      );
    }

    const companyName = active.nome_fantasia || active.razao_social || "sua empresa";
    const r = await perguntarCliente(pergunta, active.id, companyName, tela);
    return NextResponse.json(r);
  } catch (err) {
    console.error("[assistente] erro:", err);
    return NextResponse.json(
      { error: "Falha ao processar a pergunta." },
      { status: 500 },
    );
  }
}
