"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/companies";
import { createClient } from "@/lib/supabase/server";

/**
 * Define a empresa ativa do cliente no portal. Valida pela RLS que o vínculo é
 * mesmo do próprio usuário (a query só retorna a linha se for dele). Não concede
 * acesso — isso é exclusivo do contador; aqui é só preferência de visualização.
 */
export async function setActiveCompany(companyId: string) {
  if (!companyId) return;
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_companies")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return; // não é uma empresa acessível por este usuário

  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });

  revalidatePath("/portal", "layout");
}
