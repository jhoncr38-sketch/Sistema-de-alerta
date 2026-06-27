"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPaid } from "@/lib/email/notify";
import type { DocCategoria, DocType } from "@/lib/types";

/** Telas que mostram status de pagamento / comprovante. */
function revalidatePagamentos() {
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/portal/parcelamentos");
  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
}

/**
 * Marca/desmarca um boleto como pago. A autorização é feita no banco pela
 * função set_document_paid (cliente só mexe nos boletos da própria empresa;
 * admin, em qualquer um). Por isso não exige admin aqui.
 */
export async function toggleDocumentPaid(docId: string, paid: boolean) {
  const supabase = await createClient();

  // Lê o estado atual antes de alterar: assim sabemos se é uma transição
  // aberto -> pago e já temos os dados para o e-mail de confirmação.
  const { data: before } = await supabase
    .from("documents")
    .select("status,type,categoria,competencia,amount,company_id")
    .eq("id", docId)
    .single();

  const { error } = await supabase.rpc("set_document_paid", {
    doc_id: docId,
    paid,
  });
  if (error) throw new Error(error.message);

  // Confirmação de pagamento só quando a guia passou de aberta para paga.
  if (paid && before?.status === "open") {
    after(() =>
      notifyPaid({
        documentId: docId,
        companyId: before.company_id,
        categoria: before.categoria as DocCategoria,
        type: before.type as DocType,
        competencia: before.competencia,
        amount: before.amount,
      }).catch((err) => console.error("[notify] pagamento confirmado:", err)),
    );
  }

  // Atualiza as telas que mostram status de pagamento.
  revalidatePagamentos();
}

const COMPROVANTE_MAX = 10 * 1024 * 1024; // 10MB
const COMPROVANTE_TIPOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

/**
 * Anexa (ou substitui) o comprovante de pagamento de uma guia paga. É OPCIONAL:
 * só roda quando o cliente escolhe um arquivo. A permissão é checada duas vezes —
 * aqui, lendo o documento pela RLS (só aparece se o usuário pode acessá-lo), e no
 * banco, pela função set_document_comprovante. O upload usa a service role porque
 * o bucket 'boletos' é de escrita restrita ao admin; por isso validamos o dono antes.
 */
export async function attachComprovante(docId: string, formData: FormData) {
  const supabase = await createClient();

  // Dono? A RLS só deixa o usuário SELECIONAR guias das empresas que acessa
  // (cliente) ou todas (admin). Se a linha vier, ele tem permissão.
  const { data: doc } = await supabase
    .from("documents")
    .select("id,company_id,categoria,comprovante_path")
    .eq("id", docId)
    .single();
  if (!doc) throw new Error("Documento não encontrado ou sem permissão.");
  if (doc.categoria !== "boleto" && doc.categoria !== "parcelamento") {
    throw new Error("Só boletos e parcelas aceitam comprovante.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecione um arquivo.");
  }
  if (file.size > COMPROVANTE_MAX) {
    throw new Error("O comprovante é muito grande (máx. 10MB).");
  }
  if (file.type && !COMPROVANTE_TIPOS.has(file.type)) {
    throw new Error("Formato inválido. Envie PDF, PNG ou JPG.");
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${doc.company_id}/comprovantes/${docId}-${safeName}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("boletos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (upErr) throw new Error(`Falha ao enviar o comprovante: ${upErr.message}`);

  // Grava o vínculo (a função revalida o dono no banco).
  const { error: rpcErr } = await supabase.rpc("set_document_comprovante", {
    doc_id: docId,
    path,
    name: file.name,
  });
  if (rpcErr) {
    await admin.storage.from("boletos").remove([path]); // desfaz o upload órfão
    throw new Error(rpcErr.message);
  }

  // Se já havia um comprovante em outro caminho (nome diferente), remove o antigo.
  if (doc.comprovante_path && doc.comprovante_path !== path) {
    await admin.storage.from("boletos").remove([doc.comprovante_path]);
  }

  revalidatePagamentos();
}

/** Remove o comprovante de uma guia (o registro e o arquivo). */
export async function removeComprovante(docId: string) {
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("comprovante_path")
    .eq("id", docId)
    .single();
  if (!doc) throw new Error("Documento não encontrado ou sem permissão.");

  const { error } = await supabase.rpc("set_document_comprovante", {
    doc_id: docId,
    path: null,
    name: null,
  });
  if (error) throw new Error(error.message);

  if (doc.comprovante_path) {
    await createAdminClient().storage
      .from("boletos")
      .remove([doc.comprovante_path]);
  }

  revalidatePagamentos();
}

/**
 * Apaga um documento (boleto ou informativo) de TODO o sistema: o registro,
 * suas notificações (cascata) e o arquivo no bucket 'boletos'.
 * Só o contador (admin) pode apagar. Irreversível.
 */
export async function deleteDocument(docId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Pega os caminhos dos arquivos antes de remover o registro.
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path,comprovante_path")
    .eq("id", docId)
    .single();

  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) throw new Error(error.message);

  // Remove os arquivos do storage (best-effort: o registro já foi apagado):
  // o PDF da guia e, se houver, o comprovante de pagamento anexado.
  const paths = [doc?.file_path, doc?.comprovante_path].filter(
    (p): p is string => !!p,
  );
  if (paths.length) {
    await supabase.storage.from("boletos").remove(paths);
  }

  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/faturamento");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
}
