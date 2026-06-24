"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Marca/desmarca um boleto como pago. A autorização é feita no banco pela
 * função set_document_paid (cliente só mexe nos boletos da própria empresa;
 * admin, em qualquer um). Por isso não exige admin aqui.
 */
export async function toggleDocumentPaid(docId: string, paid: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_document_paid", {
    doc_id: docId,
    paid,
  });
  if (error) throw new Error(error.message);

  // Atualiza as telas que mostram status de pagamento.
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
}

/**
 * Apaga um documento (boleto ou informativo) de TODO o sistema: o registro,
 * suas notificações (cascata) e o arquivo no bucket 'boletos'.
 * Só o contador (admin) pode apagar. Irreversível.
 */
export async function deleteDocument(docId: string) {
  await requireAdmin();
  const supabase = await createClient();

  // Pega o caminho do arquivo antes de remover o registro.
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", docId)
    .single();

  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) throw new Error(error.message);

  // Remove o PDF do storage (best-effort: o registro já foi apagado).
  if (doc?.file_path) {
    await supabase.storage.from("boletos").remove([doc.file_path]);
  }

  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
  revalidatePath("/painel/faturamento");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
}
