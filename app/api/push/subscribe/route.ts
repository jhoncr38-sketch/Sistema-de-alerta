import { getUserAndProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda a assinatura de push do aparelho do cliente. A RLS garante que a linha
 * fica com profile_id = usuário logado. Idempotente: reassinar o mesmo aparelho
 * (mesmo endpoint) apenas atualiza as chaves.
 */
export async function POST(request: Request) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || !p256dh || !auth) {
    return Response.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint,
      p256dh,
      auth,
      ua: request.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
