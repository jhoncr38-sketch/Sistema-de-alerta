"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { toggleDocumentPaid } from "@/app/actions/documents";
import { notifyNewDocument, notifySegundaViaRecusada } from "@/lib/email/notify";
import { guiaNome } from "@/lib/portal";
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

  revalidatePath("/painel", "layout");
  revalidatePath("/painel/documentos");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  return { ok: true, mensagem: "2ª via publicada e cliente avisado." };
}

function revalidarTarefas() {
  revalidatePath("/painel", "layout");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/portal/parcelamentos");
}

/**
 * "Marcar como resolvido": dá baixa no pedido de 2ª via sem anexar nada aqui
 * (ex.: a 2ª via foi enviada por WhatsApp ou e-mail). Só o contador.
 */
export async function resolverSegundaVia(requestId: string): Promise<AnexarResult> {
  const { profile } = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boleto_reissue_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, mensagem: `Não foi possível atualizar: ${error.message}` };
  if (!data?.length) return { ok: false, mensagem: "Este pedido já foi tratado." };
  revalidarTarefas();
  return { ok: true, mensagem: "Pedido de 2ª via marcado como resolvido." };
}

/**
 * "Recusar pedido": encerra o pedido sem emitir a 2ª via (status 'rejected'),
 * com o motivo. Opcional: marcar a guia como paga (quando o motivo é "já foi
 * paga") e avisar o cliente por e-mail. O cliente pode pedir de novo depois.
 */
export async function recusarSegundaVia(input: {
  requestId: string;
  motivo: string;
  avisar: boolean;
  marcarPaga: boolean;
}): Promise<AnexarResult> {
  const { profile } = await requireAdmin();
  const motivo = input.motivo.trim().slice(0, 300);
  if (!motivo) return { ok: false, mensagem: "Informe o motivo." };

  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("boleto_reissue_requests")
    .select("id, status, company_id, document:documents(id, status, categoria, type, descricao, parcela_num, competencia)")
    .eq("id", input.requestId)
    .maybeSingle();
  const p = pedido as unknown as {
    id: string;
    status: string;
    company_id: string;
    document: {
      id: string;
      status: string;
      categoria: DocCategoria;
      type: DocType;
      descricao: string | null;
      parcela_num: number | null;
      competencia: string | null;
    } | null;
  } | null;
  if (!p || p.status !== "pending") return { ok: false, mensagem: "Este pedido já foi tratado." };

  const { error } = await supabase
    .from("boleto_reissue_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: profile.id })
    .eq("id", p.id)
    .eq("status", "pending");
  if (error) return { ok: false, mensagem: `Não foi possível recusar: ${error.message}` };

  // Guia já paga: marca como paga (o cliente recebe o e-mail de pagamento confirmado).
  let marcouPaga = false;
  if (input.marcarPaga && p.document && p.document.status !== "paid") {
    try {
      await toggleDocumentPaid(p.document.id, true);
      marcouPaga = true;
    } catch (e) {
      revalidarTarefas();
      return {
        ok: false,
        mensagem: `Pedido recusado, mas não consegui marcar a guia como paga: ${e instanceof Error ? e.message : "erro"}`,
      };
    }
  }

  // Um e-mail só: se a guia virou paga, o "pagamento confirmado" já avisa o cliente.
  if (input.avisar && !marcouPaga && p.document) {
    const d = p.document;
    const guia = `${guiaNome(d)}${d.competencia ? ` ${d.competencia}` : ""}`;
    after(() =>
      notifySegundaViaRecusada({ companyId: p.company_id, guia, motivo }).catch((err) =>
        console.error("[notify] 2ª via recusada:", err),
      ),
    );
  }

  revalidarTarefas();
  return {
    ok: true,
    mensagem: marcouPaga ? "Pedido recusado e guia marcada como paga." : "Pedido de 2ª via recusado.",
  };
}
