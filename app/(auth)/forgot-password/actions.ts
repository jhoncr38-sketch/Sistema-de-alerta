"use server";

import { createClient } from "@/lib/supabase/server";

export interface ForgotState {
  error?: string;
  ok?: boolean;
}

export async function requestReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe seu e-mail." };

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
  });

  // Resposta sempre "ok" para não revelar se o e-mail existe.
  return { ok: true };
}
