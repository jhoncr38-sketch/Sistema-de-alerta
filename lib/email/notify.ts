import { companyNotifyTarget } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/resend";
import {
  novoDocumentoEmail,
  pagamentoConfirmadoEmail,
} from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocCategoria, DocType } from "@/lib/types";

/**
 * Avisos disparados por evento (não pelo cron): novo documento e pagamento
 * confirmado. Usados dentro de Server Actions via `after()` para não bloquear a
 * resposta. Usam o client de service role (server-only) e registram a
 * notificação na tabela `notifications` para aparecer no portal — best-effort:
 * uma falha de e-mail nunca quebra a ação que disparou o aviso.
 */

function portalBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function portalPathFor(categoria: DocCategoria): string {
  switch (categoria) {
    case "parcelamento":
      return "/portal/parcelamentos";
    case "documento":
      return "/portal/documentos";
    case "folha":
      return "/portal/folha";
    default:
      return "/portal/boletos";
  }
}

/** Avisa a empresa que um novo documento/boleto foi disponibilizado. */
export async function notifyNewDocument(opts: {
  companyId: string;
  documentId: string;
  categoria: DocCategoria;
  type: DocType;
  competencia: string | null;
  amount: number | null;
  dueDate: string | null;
  count: number;
}): Promise<void> {
  const supabase = createAdminClient();
  const { recipients, companyName } = await companyNotifyTarget(
    supabase,
    opts.companyId,
  );

  let channel: "email" | "portal" = "portal";
  if (recipients.length > 0) {
    const { subject, html } = novoDocumentoEmail({
      companyName,
      categoria: opts.categoria,
      type: opts.type,
      competencia: opts.competencia,
      amount: opts.amount,
      dueDate: opts.dueDate,
      count: opts.count,
      portalUrl: `${portalBase()}${portalPathFor(opts.categoria)}`,
    });
    await sendEmail({ to: recipients, subject, html });
    channel = "email";
  }

  // Registra no feed do portal (ignora conflito de duplicidade).
  const { error } = await supabase
    .from("notifications")
    .insert({ document_id: opts.documentId, channel, kind: "novo_doc" });
  if (error) console.warn("[notify] novo_doc não registrado:", error.message);
}

/** Confirma à empresa que o pagamento de uma guia foi registrado. */
export async function notifyPaid(opts: {
  documentId: string;
  companyId: string;
  categoria: DocCategoria;
  type: DocType;
  competencia: string | null;
  amount: number | null;
}): Promise<void> {
  const supabase = createAdminClient();

  // Evita reenviar a confirmação se já houver uma para esta guia.
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("document_id", opts.documentId)
    .eq("kind", "pago")
    .maybeSingle();
  if (existing) return;

  const { recipients, companyName } = await companyNotifyTarget(
    supabase,
    opts.companyId,
  );

  let channel: "email" | "portal" = "portal";
  if (recipients.length > 0) {
    const { subject, html } = pagamentoConfirmadoEmail({
      companyName,
      type: opts.type,
      competencia: opts.competencia,
      amount: opts.amount,
      portalUrl: `${portalBase()}${portalPathFor(opts.categoria)}`,
    });
    await sendEmail({ to: recipients, subject, html });
    channel = "email";
  }

  const { error } = await supabase
    .from("notifications")
    .insert({ document_id: opts.documentId, channel, kind: "pago" });
  if (error) console.warn("[notify] pago não registrado:", error.message);
}
