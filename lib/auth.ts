import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileWithCompany } from "@/lib/types";

/** Retorna o usuário autenticado e seu profile (com a empresa vinculada). */
export async function getUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null as ProfileWithCompany | null };

  // Desambigua a relação: profiles tem 2 caminhos até companies (company_id
  // direto e o N-para-N via client_companies). Usamos a FK direta (principal).
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, company:companies!profiles_company_id_fkey(*)")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile as ProfileWithCompany) ?? null };
}

/** Garante que há um contador (admin) logado. Senão, redireciona. */
export async function requireAdmin() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (profile && profile.active === false) redirect("/inativo");
  if (!profile || profile.role !== "admin") redirect("/portal");
  return { user, profile };
}

/** Garante que há um cliente APROVADO e ATIVO logado. Senão, redireciona. */
export async function requireClient() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (!profile) redirect("/login");
  if (profile.role === "admin") redirect("/painel");
  if (profile.active === false) redirect("/inativo");
  if (profile.status !== "approved") redirect("/pending");
  return { user, profile };
}
