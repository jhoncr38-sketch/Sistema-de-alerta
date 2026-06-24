"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MSG,
} from "@/lib/supabase/config";

export interface AuthState {
  error?: string;
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: SUPABASE_NOT_CONFIGURED_MSG };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || password.length < 6) {
    return {
      error: "Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.",
    };
  }

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let failure: string | null = null;
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });
    if (error) {
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code;
      console.error("[register] signUp error:", {
        message: error.message,
        status,
        code,
        name: error.name,
      });
      const clean =
        error.message && error.message !== "{}" ? error.message : null;
      failure =
        clean ??
        `Não foi possível cadastrar (status ${status ?? "?"}${
          code ? `, ${code}` : ""
        }). Veja o terminal do servidor para detalhes.`;
    }
  } catch (e) {
    console.error("[register] exceção no signUp:", e);
    failure = e instanceof Error ? e.message : "Erro inesperado ao cadastrar.";
  }

  if (failure) return { error: failure };

  redirect("/verify-email");
}
