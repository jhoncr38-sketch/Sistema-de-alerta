"use server";

import { createClient } from "@/lib/supabase/server";

export interface ChangePasswordState {
  error?: string;
  ok?: boolean;
}

/**
 * Define/altera a senha do usuário LOGADO (cliente ou contador). Serve tanto
 * para trocar a senha atual quanto para o cliente que entrou por magic link
 * (sem senha) criar a primeira. Reaproveita o updateUser do Supabase — a sessão
 * atual já autentica a ação.
 */
export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    return { error: "A senha deve ter pelo menos 6 caracteres." };
  }
  if (password !== confirm) {
    return { error: "As senhas não conferem." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sessão expirada. Entre novamente para alterar a senha." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}
