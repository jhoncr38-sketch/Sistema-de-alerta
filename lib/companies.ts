import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

/** Empresa ativa escolhida pelo cliente no portal (preferência de visualização). */
export const ACTIVE_COMPANY_COOKIE = "ca_active_company";

function companyName(c: Company): string {
  return c.nome_fantasia || c.razao_social;
}

/**
 * Empresas que o cliente logado pode ver. Quem define o conjunto é o contador
 * (tabela client_companies, escrita só por admin); aqui apenas lemos via RLS.
 */
export async function getAccessibleCompanies(): Promise<Company[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_companies")
    .select("company:companies(*)");

  const rows = (data ?? []) as unknown as { company: Company | null }[];
  return rows
    .map((r) => r.company)
    .filter((c): c is Company => !!c)
    .sort((a, b) => companyName(a).localeCompare(companyName(b)));
}

export interface ClientCompanyContext {
  companies: Company[];
  active: Company | null;
}

/**
 * Empresas acessíveis + a empresa ativa. A ativa vem do cookie (se ainda for
 * acessível); senão, a primeira da lista. Determinístico entre layout e páginas.
 */
export async function getClientCompanyContext(): Promise<ClientCompanyContext> {
  const companies = await getAccessibleCompanies();
  const store = await cookies();
  const cookieId = store.get(ACTIVE_COMPANY_COOKIE)?.value;
  const active =
    companies.find((c) => c.id === cookieId) ?? companies[0] ?? null;
  return { companies, active };
}

/** Só o id da empresa ativa — atalho para as páginas do portal filtrarem. */
export async function getActiveCompanyId(): Promise<string | null> {
  const { active } = await getClientCompanyContext();
  return active?.id ?? null;
}
