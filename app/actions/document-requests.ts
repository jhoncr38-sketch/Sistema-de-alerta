"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCompetencia } from "@/lib/dates";
import { notifyDocumentRequest } from "@/lib/email/notify";
import { creditDocumentOnTime } from "@/lib/rewards-credit";

const SUBMIT_MAX = 10 * 1024 * 1024; // 10MB
const SUBMIT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "text/csv",
  "application/xml",
  "text/xml", // NF-e
]);

export interface RequestFormState {
  error?: string;
  ok?: boolean;
}

function revalidateRequests() {
  revalidatePath("/painel/solicitacoes");
  revalidatePath("/portal/solicitacoes");
  revalidatePath("/portal");
  revalidatePath("/portal/rewards"); // progresso da missão do mês
}

/** Admin cria uma solicitação de documento para uma empresa. */
export async function createDocumentRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const { profile } = await requireAdmin();

  const companyId = String(formData.get("company_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const competenciaRaw = String(formData.get("competencia") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();

  if (!companyId || !title) {
    return { error: "Informe a empresa e o título do documento pedido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("document_requests").insert({
    company_id: companyId,
    title,
    description: description || null,
    competencia: competenciaRaw ? normalizeCompetencia(competenciaRaw) : null,
    due_date: dueDate || null,
    created_by: profile.id,
  });
  if (error) return { error: `Falha ao criar solicitação: ${error.message}` };

  // Avisa o cliente por e-mail (best-effort, fora do caminho crítico).
  after(async () => {
    try {
      await notifyDocumentRequest({
        companyId,
        title,
        description: description || null,
        dueDate: dueDate || null,
      });
    } catch {
      /* best-effort: o e-mail nunca quebra a criação da solicitação */
    }
  });

  revalidateRequests();
  return { ok: true };
}

/** Admin exclui uma solicitação (e o arquivo enviado, se houver). */
export async function deleteDocumentRequest(id: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("document_requests")
    .select("file_path")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("document_requests")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (req?.file_path) {
    await createAdminClient().storage.from("boletos").remove([req.file_path]);
  }
  revalidateRequests();
}

/**
 * Cliente envia o arquivo de uma solicitação. A permissão é checada pela RLS ao
 * ler a solicitação e no banco pela função submit_document_request. Credita SJ
 * Coins se enviado no prazo (idempotente por solicitação).
 */
export async function submitDocumentRequest(id: string, formData: FormData) {
  const supabase = await createClient();

  // A RLS só deixa ler solicitações das empresas que o cliente acessa.
  const { data: req } = await supabase
    .from("document_requests")
    .select("id,company_id,due_date")
    .eq("id", id)
    .single();
  if (!req) throw new Error("Solicitação não encontrada ou sem permissão.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecione um arquivo.");
  }
  if (file.size > SUBMIT_MAX) {
    throw new Error("O arquivo é muito grande (máx. 10MB).");
  }
  if (file.type && !SUBMIT_TYPES.has(file.type)) {
    throw new Error("Formato inválido. Envie PDF, imagem, planilha ou XML.");
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${req.company_id}/solicitacoes/${id}-${safeName}`;

  // Cliente não tem INSERT no storage: sobe pela service role.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from("boletos").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (upErr) throw new Error(`Falha ao enviar o arquivo: ${upErr.message}`);

  const { error: rpcErr } = await supabase.rpc("submit_document_request", {
    p_id: id,
    p_path: path,
    p_name: file.name,
  });
  if (rpcErr) {
    await admin.storage.from("boletos").remove([path]); // desfaz upload órfão
    throw new Error(rpcErr.message);
  }

  // SJ Rewards: crédito por enviar no prazo (best-effort, idempotente).
  await creditDocumentOnTime(supabase, {
    companyId: req.company_id,
    requestId: id,
    dueDate: req.due_date,
  });

  revalidateRequests();
}
