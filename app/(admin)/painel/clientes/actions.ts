"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface CompanyFormState {
  error?: string;
  ok?: boolean;
}

/**
 * Cadastra uma empresa avulsa (sem depender de um cadastro de cliente).
 * Útil para pré-cadastrar empresas que o contador já atende e enviar
 * documentos antes mesmo do cliente criar um login.
 */
export async function createCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const razao = String(formData.get("razao_social") ?? "").trim();
  const fantasia = String(formData.get("nome_fantasia") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!razao || !cnpj) {
    return { error: "Informe ao menos a razão social e o CNPJ." };
  }

  const { error } = await supabase.from("companies").insert({
    razao_social: razao,
    nome_fantasia: fantasia || null,
    cnpj,
    email: email || null,
    phone: phone || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma empresa com esse CNPJ." };
    }
    return { error: error.message };
  }

  revalidatePath("/painel/clientes");
  revalidatePath("/painel/faturamento");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/enviar");
  return { ok: true };
}

/** Aprova um cliente pendente e vincula a uma empresa (existente ou nova). */
export async function approveClient(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const userId = String(formData.get("userId") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  const razao = String(formData.get("razao_social") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  if (!userId) return;

  let linkedCompanyId = companyId;

  if (!linkedCompanyId) {
    // Sem empresa selecionada -> cria uma nova com os dados informados.
    if (!razao || !cnpj) return;
    const { data, error } = await supabase
      .from("companies")
      .insert({ razao_social: razao, cnpj })
      .select("id")
      .single();
    if (error || !data) return;
    linkedCompanyId = data.id;
  }

  await supabase
    .from("profiles")
    .update({ status: "approved", company_id: linkedCompanyId })
    .eq("id", userId);

  revalidatePath("/painel/clientes");
}

/** Recusa um cadastro pendente. */
export async function rejectClient(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  await supabase.from("profiles").update({ status: "rejected" }).eq("id", userId);
  revalidatePath("/painel/clientes");
}

/**
 * Apaga uma empresa e TUDO ligado a ela, de todo o sistema:
 *  - boletos, documentos, faturamento e notificações (cascata no banco);
 *  - os arquivos (PDFs) no bucket 'boletos';
 *  - os logins dos clientes vinculados (o admin/contador nunca é apagado).
 * Usa o service-role porque apagar usuários do Auth exige privilégio.
 * Irreversível.
 */
export async function deleteCompany(companyId: string) {
  await requireAdmin();
  if (!companyId) return;

  const admin = createAdminClient();

  // 1) Identifica os clientes vinculados ANTES de apagar a empresa
  //    (depois disso o vínculo viraria null por `on delete set null`).
  const { data: linked } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "client");

  // 2) Apaga cada login de cliente. O profile some por cascata
  //    (profiles.id -> auth.users on delete cascade). Best-effort por usuário.
  for (const p of linked ?? []) {
    try {
      await admin.auth.admin.deleteUser(p.id);
    } catch {
      // segue apagando os demais e a empresa mesmo se um usuário falhar
    }
  }

  // 3) Remove os arquivos do storage sob o prefixo {companyId}/...
  const { data: files } = await admin.storage
    .from("boletos")
    .list(companyId, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage
      .from("boletos")
      .remove(files.map((f) => `${companyId}/${f.name}`));
  }

  // 4) Apaga a empresa — cascata leva documentos, faturamento e notificações.
  const { error } = await admin.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(error.message);

  revalidatePath("/painel/clientes");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/faturamento");
  revalidatePath("/painel");
}
