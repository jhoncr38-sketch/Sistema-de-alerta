"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getUserAndProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPaid, notifyPagamentoAguardando } from "@/lib/email/notify";
import { creditPaymentOnTime, reversePaymentCredit } from "@/lib/rewards-credit";
import type { DocCategoria, DocType } from "@/lib/types";

/** Colunas lidas antes de mexer no status — dados p/ rewards, e-mail e transição. */
const DOC_BEFORE_COLS =
  "status,type,categoria,competencia,amount,company_id,due_date,marcado_pago_at";

/**
 * Credita SJ Rewards e avisa o cliente que o pagamento foi CONFIRMADO. Roda só na
 * confirmação (contador) — não quando o cliente declara. O "em dia" usa a data em
 * que o cliente marcou (marcado_pago_at); na falta dela, cai no vencimento.
 */
async function creditAndNotifyConfirmed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  docId: string,
  before: {
    company_id: string;
    categoria: string;
    type: string;
    competencia: string | null;
    amount: number | null;
    due_date: string | null;
    marcado_pago_at: string | null;
  },
) {
  await creditPaymentOnTime(supabase, {
    id: docId,
    companyId: before.company_id,
    categoria: before.categoria as DocCategoria,
    type: before.type as DocType,
    dueDate: before.due_date,
    // Considera "em dia" pela data em que o cliente declarou o pagamento.
    paidAt: before.marcado_pago_at,
  });
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
 * admin, em qualquer um).
 *
 * O efeito depende de QUEM marca:
 *   • CLIENTE marcando  -> guia vai para 'aguardando' e o CONTADOR é avisado
 *     (e-mail + feed). Nada de rewards ainda — só na confirmação.
 *   • CONTADOR marcando -> guia vai direto para 'paid' (ele é a confirmação):
 *     credita rewards e avisa o cliente.
 *   • Desmarcar (paid=false) -> volta para 'open' e estorna a recompensa.
 */
export async function toggleDocumentPaid(docId: string, paid: boolean) {
  const supabase = await createClient();
  const { profile } = await getUserAndProfile();
  const isAdmin = profile?.role === "admin";

  // Lê o estado atual antes de alterar (dados p/ transição, rewards e e-mail).
  const { data: before } = await supabase
    .from("documents")
    .select(DOC_BEFORE_COLS)
    .eq("id", docId)
    .single();

  const { error } = await supabase.rpc("set_document_paid", {
    doc_id: docId,
    paid,
  });
  if (error) throw new Error(error.message);

  if (paid && isAdmin && before?.status !== "paid") {
    // Contador marcou: é a confirmação — credita e avisa o cliente.
    await creditAndNotifyConfirmed(supabase, docId, before!);
  } else if (paid && !isAdmin && before?.status === "open") {
    // Cliente declarou o pagamento: avisa o contador que há algo a confirmar.
    after(() =>
      notifyPagamentoAguardando({
        documentId: docId,
        companyId: before!.company_id,
        categoria: before!.categoria as DocCategoria,
        type: before!.type as DocType,
        competencia: before!.competencia,
        amount: before!.amount,
      }).catch((err) => console.error("[notify] aguardando confirmação:", err)),
    );
  }

  // Desmarcou (pago -> aberto): anula a recompensa creditada por esta guia.
  if (!paid && before?.status === "paid") {
    await reversePaymentCredit(supabase, {
      companyId: before.company_id,
      docId,
    });
  }

  // Atualiza as telas que mostram status de pagamento.
  revalidatePagamentos();
}

/**
 * O contador CONFIRMA (confirm=true) ou REJEITA (confirm=false) um pagamento que
 * o cliente declarou ('aguardando'). Só admin — a função do banco valida. Ao
 * confirmar, credita os rewards e avisa o cliente; ao rejeitar, volta para
 * 'open' (nada é creditado). Idempotente pela verificação de status anterior.
 */
export async function confirmDocumentPayment(docId: string, confirm: boolean) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("documents")
    .select(DOC_BEFORE_COLS)
    .eq("id", docId)
    .single();

  const { error } = await supabase.rpc("confirm_document_payment", {
    doc_id: docId,
    confirm,
  });
  if (error) throw new Error(error.message);

  // Só credita/avisa na primeira confirmação (não estava 'paid' ainda).
  if (confirm && before && before.status !== "paid") {
    await creditAndNotifyConfirmed(supabase, docId, before);
  }

  revalidatePagamentos();
}

const COMPROVANTE_MAX = 10 * 1024 * 1024; // 10MB
const COMPROVANTE_TIPOS = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

/**
 * Núcleo do anexo de comprovante: valida dono/arquivo, sobe ao bucket e grava o
 * vínculo. Não revalida nem mexe em status — quem chama decide o resto. Usado por
 * attachComprovante (anexo avulso) e por payWithComprovante (anexar + marcar pago).
 */
async function uploadComprovanteCore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  docId: string,
  file: unknown,
) {
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
}

/**
 * Anexa (ou substitui) o comprovante de pagamento de uma guia paga. É OPCIONAL:
 * só roda quando o cliente escolhe um arquivo. A permissão é checada duas vezes —
 * pela RLS ao ler o documento e no banco, pela função set_document_comprovante.
 */
export async function attachComprovante(docId: string, formData: FormData) {
  const supabase = await createClient();
  await uploadComprovanteCore(supabase, docId, formData.get("file"));
  revalidatePagamentos();
}

/**
 * Anexa o comprovante E marca a guia como paga, em um só passo. Usado quando a
 * guia exige comprovante: o cliente não consegue quitar sem anexar, então o
 * botão "marcar pago" vira este fluxo. Anexa primeiro (para passar na regra do
 * banco) e só então marca pago.
 */
export async function payWithComprovante(docId: string, formData: FormData) {
  const supabase = await createClient();
  const { profile } = await getUserAndProfile();
  const isAdmin = profile?.role === "admin";

  // Estado antes (para saber se houve transição e para os avisos).
  const { data: before } = await supabase
    .from("documents")
    .select(DOC_BEFORE_COLS)
    .eq("id", docId)
    .single();

  await uploadComprovanteCore(supabase, docId, formData.get("file"));

  const { error } = await supabase.rpc("set_document_paid", {
    doc_id: docId,
    paid: true,
  });
  if (error) throw new Error(error.message);

  if (isAdmin && before?.status !== "paid") {
    // Contador anexou e confirmou de uma vez.
    await creditAndNotifyConfirmed(supabase, docId, before!);
  } else if (!isAdmin && before?.status === "open") {
    // Cliente anexou comprovante e declarou pagamento -> aguarda confirmação.
    after(() =>
      notifyPagamentoAguardando({
        documentId: docId,
        companyId: before!.company_id,
        categoria: before!.categoria as DocCategoria,
        type: before!.type as DocType,
        competencia: before!.competencia,
        amount: before!.amount,
      }).catch((err) => console.error("[notify] aguardando confirmação:", err)),
    );
  }

  revalidatePagamentos();
}

/**
 * Liga/desliga a exigência de comprovante de uma guia. Só o contador (admin) —
 * a autorização é feita no banco por set_document_require_proof.
 */
export async function setDocumentRequireProof(docId: string, value: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_document_require_proof", {
    doc_id: docId,
    value,
  });
  if (error) throw new Error(error.message);
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
  revalidatePath("/painel/folha");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/portal/folha");
}
