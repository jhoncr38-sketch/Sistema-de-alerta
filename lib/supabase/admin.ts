import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a SERVICE ROLE KEY — ignora RLS.
 * Use APENAS no servidor (server actions, route handlers, cron).
 * Nunca importe isto em Client Components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
