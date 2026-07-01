import { getUserAndProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Remove a assinatura de push do aparelho (cliente desativou os avisos). */
export async function POST(request: Request) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return Response.json({ error: "Endpoint inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  // A RLS restringe a exclusão às assinaturas do próprio usuário.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
