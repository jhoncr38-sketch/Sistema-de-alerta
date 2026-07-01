"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface CompanyFormState {
  error?: string;
  ok?: boolean;
}

export interface ClientFormState {
  error?: string;
  ok?: boolean;
}

function revalidateClientes() {
  revalidatePath("/painel/clientes");
  revalidatePath("/painel/faturamento");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/enviar");
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

  revalidateClientes();
  return { ok: true };
}

/** Edita os dados cadastrais de uma empresa. */
export async function updateCompany(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const razao = String(formData.get("razao_social") ?? "").trim();
  const fantasia = String(formData.get("nome_fantasia") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!id) return { error: "Empresa inválida." };
  if (!razao || !cnpj) {
    return { error: "Informe ao menos a razão social e o CNPJ." };
  }

  const { error } = await supabase
    .from("companies")
    .update({
      razao_social: razao,
      nome_fantasia: fantasia || null,
      cnpj,
      email: email || null,
      phone: phone || null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma empresa com esse CNPJ." };
    }
    return { error: error.message };
  }

  revalidateClientes();
  revalidatePath("/painel");
  return { ok: true };
}

/**
 * Edita um cliente: nome e o CONJUNTO de empresas que ele pode ver.
 * Só o contador faz isso. A primeira empresa marcada vira a "principal"
 * (company_id) usada como padrão; o cliente apenas alterna entre elas.
 */
export async function updateClient(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const userId = String(formData.get("userId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const companyIds = formData
    .getAll("companyIds")
    .map((v) => String(v))
    .filter(Boolean);

  if (!userId) return { error: "Cliente inválido." };
  if (!name) return { error: "Informe o nome do cliente." };

  const primary = companyIds[0] ?? null;

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ name, company_id: primary })
    .eq("id", userId);
  if (profErr) return { error: profErr.message };

  // Substitui o conjunto de vínculos pelo informado.
  await supabase.from("client_companies").delete().eq("profile_id", userId);
  if (companyIds.length > 0) {
    const { error: linkErr } = await supabase
      .from("client_companies")
      .insert(companyIds.map((cid) => ({ profile_id: userId, company_id: cid })));
    if (linkErr) return { error: linkErr.message };
  }

  revalidateClientes();
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

  // Registra o vínculo N-para-N (o contador pode adicionar mais empresas depois).
  await supabase
    .from("client_companies")
    .upsert(
      { profile_id: userId, company_id: linkedCompanyId },
      { onConflict: "profile_id,company_id" },
    );

  revalidateClientes();
}

/**
 * Apaga o CADASTRO de um cliente (login/pessoa) da base — sem mexer nas
 * empresas, que são do contador e podem ter outros clientes vinculados.
 * Apagar o usuário do Auth cascateia automaticamente: o profile
 * (on delete cascade) e os vínculos em client_companies (on delete cascade).
 * Os documentos/boletos permanecem, pois pertencem à EMPRESA, não ao cliente.
 * Trava de segurança: só apaga linhas com role='client'; o contador (admin)
 * nunca é apagado. Usa o service-role porque apagar usuários do Auth exige
 * privilégio. Irreversível.
 */
export async function deleteClient(userId: string) {
  await requireAdmin();
  if (!userId) return;

  const admin = createAdminClient();

  // Garante que o alvo é mesmo um cliente (nunca apaga o contador/admin).
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!prof || prof.role !== "client") {
    throw new Error("Só é possível apagar cadastros de clientes.");
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath("/painel/clientes");
  revalidatePath("/painel");
}

/**
 * Promove um cliente a CONTADOR (admin): ele passa a enxergar o painel
 * completo — TODOS os clientes, empresas e documentos do escritório (o
 * sistema é de um escritório só; os admins compartilham os mesmos dados).
 * Use para sócios/assistentes de confiança. Reversível via demoteToClient.
 */
export async function promoteToAdmin(userId: string) {
  await requireAdmin();
  if (!userId) return;

  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!prof) throw new Error("Usuário não encontrado.");
  if (prof.role === "admin") return; // já é contador

  const { error } = await admin
    .from("profiles")
    .update({ role: "admin", status: "approved" })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidateClientes();
  revalidatePath("/painel");
}

/**
 * Remove o acesso de contador de alguém, voltando o perfil para CLIENTE.
 * Travas de segurança: ninguém remove o próprio acesso (evita se trancar pra
 * fora) e o sistema nunca fica sem nenhum contador.
 */
export async function demoteToClient(userId: string) {
  const { user } = await requireAdmin();
  if (!userId) return;
  if (userId === user.id) {
    throw new Error("Você não pode remover o seu próprio acesso de contador.");
  }

  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!prof || prof.role !== "admin") {
    throw new Error("Este usuário não é contador.");
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if ((count ?? 0) <= 1) {
    throw new Error("Não é possível remover o último contador do sistema.");
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: "client", status: "approved" })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidateClientes();
  revalidatePath("/painel");
}

/**
 * Desativa ou reativa o ACESSO de um cliente ao portal, sem apagar nada.
 * Cliente desativado (active=false) é barrado no login e em toda página do
 * portal (redirecionado para /inativo), mas o cadastro, os vínculos e os
 * documentos permanecem — basta reativar para liberar de novo.
 * Trava de segurança: só mexe em quem tem role='client' (nunca desativa o
 * contador, que não teria como se reativar depois).
 */
export async function setClientActive(userId: string, active: boolean) {
  await requireAdmin();
  if (!userId) return;

  const supabase = await createClient();

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!prof || prof.role !== "client") {
    throw new Error("Só é possível desativar o acesso de clientes.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidateClientes();
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
 *  - os vínculos cliente↔empresa (cascata).
 * Com multi-empresa: um cliente que ficar SEM nenhuma empresa tem o login
 * apagado (era exclusivo desta empresa); quem ainda tiver outra empresa é
 * mantido, só perde o acesso a esta. O admin/contador nunca é apagado.
 * Usa o service-role porque apagar usuários do Auth exige privilégio. Irreversível.
 */
export async function deleteCompany(companyId: string) {
  await requireAdmin();
  if (!companyId) return;

  const admin = createAdminClient();

  // 1) Clientes vinculados a esta empresa ANTES de apagar (o vínculo some na cascata).
  const { data: linked } = await admin
    .from("client_companies")
    .select("profile_id")
    .eq("company_id", companyId);
  const profileIds = [...new Set((linked ?? []).map((r) => r.profile_id))];

  // 2) Remove os arquivos do storage sob o prefixo {companyId}/...
  const { data: files } = await admin.storage
    .from("boletos")
    .list(companyId, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage
      .from("boletos")
      .remove(files.map((f) => `${companyId}/${f.name}`));
  }

  // 3) Apaga a empresa — cascata leva documentos, faturamento, notificações e vínculos.
  const { error } = await admin.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(error.message);

  // 4) Acerta cada cliente que estava vinculado.
  for (const pid of profileIds) {
    const { data: remaining } = await admin
      .from("client_companies")
      .select("company_id")
      .eq("profile_id", pid);

    if (!remaining || remaining.length === 0) {
      // Sem nenhuma empresa: login era exclusivo desta empresa -> apaga.
      try {
        await admin.auth.admin.deleteUser(pid);
      } catch {
        // segue mesmo se um usuário falhar
      }
    } else {
      // Ainda tem empresa: garante que a "principal" aponte para uma válida.
      const { data: prof } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", pid)
        .single();
      if (!prof?.company_id) {
        await admin
          .from("profiles")
          .update({ company_id: remaining[0].company_id })
          .eq("id", pid);
      }
    }
  }

  revalidatePath("/painel/clientes");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/faturamento");
  revalidatePath("/painel");
}
