import { NextResponse } from "next/server";
import { conversarCliente, type TurnoChat } from "@/lib/ai/assistente";
import { rateLimit } from "@/lib/ai/rate-limit";
import { consumirUsoIA } from "@/lib/ai/usage";
import { getUserAndProfile } from "@/lib/auth";
import { getClientCompanyContext } from "@/lib/companies";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Aba "Converse com sua empresa" (POST). Conversa CONTÍNUA (multi-turno) do
 * cliente sobre a empresa ativa. Diferente de /api/assistente (turno único), aqui
 * o front envia o histórico recente para respostas em contexto.
 *
 * Segurança:
 *  - exige cliente autenticado e ativo;
 *  - exige que a aba esteja ligada para a empresa (companies.chat_enabled);
 *  - escopo = empresa ativa do cliente (nunca outra);
 *  - rate-limit por usuário protege o custo da OpenAI.
 *
 * Corpo: { pergunta: string, historico?: {autor,texto}[] }.
 */
export async function POST(request: Request) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (profile.role === "admin") {
    // A aba de conversa é do cliente; o contador usa o assistente do painel.
    return NextResponse.json({ error: "Indisponível." }, { status: 403 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Acesso desativado." }, { status: 403 });
  }

  let pergunta = "";
  let historico: TurnoChat[] = [];
  try {
    const body = (await request.json()) as {
      pergunta?: unknown;
      historico?: unknown;
    };
    if (typeof body.pergunta === "string") pergunta = body.pergunta;
    if (Array.isArray(body.historico)) {
      historico = body.historico
        .filter(
          (t): t is TurnoChat =>
            !!t &&
            typeof t === "object" &&
            (t as TurnoChat).autor !== undefined &&
            typeof (t as TurnoChat).texto === "string",
        )
        .map((t) => ({
          autor: t.autor === "assistente" ? "assistente" : "voce",
          texto: t.texto,
        }));
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!pergunta.trim()) {
    return NextResponse.json({ error: "Pergunta vazia." }, { status: 400 });
  }

  // Empresa ativa (a mesma do portal) + confere se a aba está ligada.
  const { active } = await getClientCompanyContext();
  if (!active) {
    return NextResponse.json({
      disponivel: true,
      resposta: "Você ainda não tem uma empresa vinculada. Fale com seu contador.",
    });
  }
  if (active.chat_enabled === false) {
    return NextResponse.json({ error: "Recurso indisponível." }, { status: 403 });
  }

  const rl = rateLimit(`conversar:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Muitas perguntas em pouco tempo. Aguarde ${rl.retryAfterSec}s e tente de novo.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Teto MENSAL por empresa (controle de custo). Consome 1 uso; se estourou,
  // não chama a OpenAI (custo zero) e avisa que renova no mês que vem.
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

  try {
    const companyName = active.nome_fantasia || active.razao_social || "sua empresa";
    const r = await conversarCliente(pergunta, historico, active.id, companyName);
    return NextResponse.json(r);
  } catch (err) {
    console.error("[conversar] erro:", err);
    return NextResponse.json(
      { error: "Falha ao processar a pergunta." },
      { status: 500 },
    );
  }
}
