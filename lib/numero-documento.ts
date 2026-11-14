import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { numeroDocumentoDoTexto, vencimentoDoTexto } from "@/lib/pagamentos-casar";

/**
 * Número do documento de arrecadação (DAS/DARF) — a "chave" que a rotina de
 * pagamentos usa para achar a guia paga na Receita (ver lib/pagamentos-receita).
 */

/** Texto do PDF (todas as páginas). null se não for um PDF legível. */
async function textoDe(pdf: Uint8Array | ArrayBuffer | string): Promise<string | null> {
  try {
    // Cópia: o leitor de PDF pode "consumir" o buffer que recebe.
    const bytes =
      typeof pdf === "string"
        ? new Uint8Array(Buffer.from(pdf, "base64"))
        : new Uint8Array(pdf instanceof Uint8Array ? pdf.slice() : pdf.slice(0));
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch {
    return null;
  }
}

/** Lê o número do documento no texto do PDF. null se não achar ou não for PDF legível. */
export async function numeroDocumentoDoPdf(
  pdf: Uint8Array | ArrayBuffer | string,
): Promise<string | null> {
  const texto = await textoDe(pdf);
  return texto ? numeroDocumentoDoTexto(texto) : null;
}

/** Número do documento e data-limite de pagamento (YYYY-MM-DD) lidos do PDF. */
export async function lerGuiaDoPdf(
  pdf: Uint8Array | ArrayBuffer | string,
): Promise<{ numeroDocumento: string | null; vencimento: string | null }> {
  const texto = await textoDe(pdf);
  if (!texto) return { numeroDocumento: null, vencimento: null };
  return { numeroDocumento: numeroDocumentoDoTexto(texto), vencimento: vencimentoDoTexto(texto) };
}

/** Igual, a partir de um arquivo enviado (só PDF). */
export async function numeroDocumentoDoArquivo(file: File): Promise<string | null> {
  const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!ehPdf) return null;
  return numeroDocumentoDoPdf(await file.arrayBuffer());
}

/**
 * Grava o número na guia. Fica FORA do insert de propósito: se a migração 0040
 * ainda não foi aplicada (coluna não existe), só registra no log — publicar a
 * guia nunca falha por causa disto.
 */
export async function guardarNumeroDocumento(
  supabase: SupabaseClient,
  docId: string,
  numero: string | null | undefined,
): Promise<void> {
  const n = (numero ?? "").replace(/\D/g, "");
  if (!n) return;
  const { error } = await supabase
    .from("documents")
    .update({ numero_documento: n })
    .eq("id", docId);
  if (error) console.warn("[numero_documento] não gravado:", error.message);
}
