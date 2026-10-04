"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { notifyNewDocument } from "@/lib/email/notify";
import { createClient } from "@/lib/supabase/server";
import type { DocCategoria, DocType } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS = new Set(["application/pdf", "image/png", "image/jpeg"]);

export interface AnexarResult {
  ok: boolean;
  mensagem: string;
}

/**
 * Caixa "Para você fazer" → "Anexar": o contador sobe a 2ª via de um boleto
 * pedido pelo cliente. Troca o arquivo, o valor e o vencimento DA MESMA guia
 * (sem duplicar), resolve o pedido e avisa o cliente. Só o contador.
 */
export async function anexarSegundaVia(formData: FormData): Promise<AnexarResult> {
  const { profile } = await requireAdmin();

  const requestId = String(formData.get("requestId") ?? "");
  const file = formData.get("file");
  const valor = Number(String(formData.get("valor") ?? "").replace(",", "."));
  const vencimento = String(formData.get("vencimento") ?? "");

  if (!(file instanceof File) || file.size === 0) return { ok: false, mensagem: "Escolha o PDF da 2ª via." };
  if (file.size > MAX_BYTES) return { ok: false, mensagem: "Arquivo muito grande (máx. 10MB)." };
  if (file.type && !TIPOS.has(file.type)) return { ok: false, mensagem: "Envie PDF, PNG ou JPG." };
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, mensagem: "Informe o valor." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { ok: false, mensagem: "Informe o vencimento." };

  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("boleto_reissue_requests")
    .select("id, status, document_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!pedido || pedido.status !== "pending") {
    return { ok: false, mensagem: "Este pedido já foi resolvido." };
  }
  const { data: doc } = await supabase
    .from("documents")
    .select("id, company_id, type, categoria, competencia, file_path")
    .eq("id", pedido.document_id)
    .single();
  if (!doc) return { ok: false, mensagem: "Guia não encontrada." };

  // Sobe o arquivo novo (nome único — não sobrescreve o antigo antes da troca).
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${doc.company_id}/${doc.id}-2via-${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("boletos")
    .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  if (upErr) return { ok: false, mensagem: `Falha ao enviar o arquivo: ${upErr.message}` };

  const { error: updErr } = await supabase
    .from("documents")
    .update({
      file_path: path,
      file_name: file.name,
      amount: Math.round(valor * 100) / 100,
      due_date: vencimento,
      first_viewed_at: null, // arquivo novo: volta a "não visto"
    })
    .eq("id", doc.id);
  if (updErr) {
    await supabase.storage.from("boletos").remove([path]);
    return { ok: false, mensagem: `Falha ao atualizar a guia: ${updErr.message}` };
  }
  if (doc.file_path && doc.file_path !== path) {
    await supabase.storage.from("boletos").remove([doc.file_path]);
  }

  await supabase
    .from("boleto_reissue_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", pedido.id);

  after(() =>
    notifyNewDocument({
      companyId: doc.company_id,
      documentId: doc.id,
      categoria: doc.categoria as DocCategoria,
      type: doc.type as DocType,
      competencia: doc.competencia,
      amount: valor,
      dueDate: vencimento,
      count: 1,
    }).catch((err) => console.error("[notify] 2a via anexada:", err)),
  );

  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  return { ok: true, mensagem: "2ª via publicada e cliente avisado." };
}
