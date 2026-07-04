import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Destinatários e nome de exibição de uma empresa para avisos por e-mail:
 * usuários aprovados do portal vinculados à empresa + o e-mail de contato
 * cadastrado na própria empresa (deduplicados).
 *
 * Espera um client com leitura ampla (admin / service role), porque precisa
 * enxergar os perfis de outros usuários — o que a RLS bloqueia para clientes.
 */
export async function companyNotifyTarget(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ recipients: string[]; companyName: string }> {
  const [{ data: profiles }, { data: company }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email")
      .eq("company_id", companyId)
      .eq("role", "client")
      .eq("status", "approved"),
    supabase
      .from("companies")
      .select("email,razao_social,nome_fantasia")
      .eq("id", companyId)
      .single(),
  ]);

  const recipients = Array.from(
    new Set([
      ...((profiles ?? [])
        .map((p) => p.email as string | null)
        .filter((e): e is string => !!e)),
      ...(company?.email ? [company.email as string] : []),
    ]),
  );

  const companyName =
    company?.nome_fantasia || company?.razao_social || "Cliente";

  return { recipients, companyName };
}

/**
 * E-mails do(s) contador(es) para avisos internos (ex.: pagamento aguardando
 * confirmação). Usa os perfis role='admin' ativos + um fallback opcional na env
 * CONTADOR_EMAIL. Deduplicado. Espera um client com leitura ampla (service role).
 */
export async function adminNotifyTarget(
  supabase: SupabaseClient,
): Promise<{ recipients: string[] }> {
  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("active", true);

  const fallback = process.env.CONTADOR_EMAIL;
  const recipients = Array.from(
    new Set([
      ...((admins ?? [])
        .map((p) => p.email as string | null)
        .filter((e): e is string => !!e)),
      ...(fallback ? [fallback] : []),
    ]),
  );

  return { recipients };
}
