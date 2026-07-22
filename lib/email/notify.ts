import { adminNotifyTarget, companyNotifyTarget } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/resend";
import {
  avisoEmail,
  novoDocumentoEmail,
  pagamentoAguardandoEmail,
  pagamentoConfirmadoEmail,
  segundaViaEmail,
  solicitacaoDocumentoEmail,
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

/**
 * Avisa O CONTADOR que um cliente declarou o pagamento de uma guia e ela aguarda
 * confirmação. Dispara e-mail aos admins e registra a notificação (kind
 * 'aguardando'), idempotente por guia. Best-effort — nunca quebra a ação.
 */
export async function notifyPagamentoAguardando(opts: {
  documentId: string;
  companyId: string;
  categoria: DocCategoria;
  type: DocType;
  competencia: string | null;
  amount: number | null;
}): Promise<void> {
  const supabase = createAdminClient();

  // Não reenvia se já houver um aviso de "aguardando" para esta guia.
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("document_id", opts.documentId)
    .eq("kind", "aguardando")
    .maybeSingle();
  if (existing) return;

  const [{ companyName }, { recipients }] = await Promise.all([
    companyNotifyTarget(supabase, opts.companyId),
    adminNotifyTarget(supabase),
  ]);

  let channel: "email" | "portal" = "portal";
  if (recipients.length > 0) {
    const { subject, html } = pagamentoAguardandoEmail({
      companyName,
      type: opts.type,
      competencia: opts.competencia,
      amount: opts.amount,
      painelUrl: `${portalBase()}/painel`,
    });
    await sendEmail({ to: recipients, subject, html });
    channel = "email";
  }

  const { error } = await supabase
    .from("notifications")
    .insert({ document_id: opts.documentId, channel, kind: "aguardando" });
  if (error) console.warn("[notify] aguardando não registrado:", error.message);
}

/** Avisa a empresa que o contador solicitou um documento pelo portal. */
export async function notifyDocumentRequest(opts: {
  companyId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { recipients, companyName } = await companyNotifyTarget(
    supabase,
    opts.companyId,
  );
  if (recipients.length === 0) return;

  const { subject, html } = solicitacaoDocumentoEmail({
    companyName,
    title: opts.title,
    description: opts.description,
    dueDate: opts.dueDate,
    portalUrl: `${portalBase()}/portal/solicitacoes`,
  });
  await sendEmail({ to: recipients, subject, html });
}

/**
 * Envia o aviso/comunicado do contador por e-mail. Para uma empresa: um e-mail
 * aos destinatários dela. Global (companyId null): um e-mail POR empresa ativa
 * (personaliza e evita expor os e-mails dos clientes entre si).
 */
export async function notifyAviso(opts: {
  companyId: string | null;
  title: string;
  message: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const portalUrl = `${portalBase()}/portal`;

  async function sendTo(companyId: string) {
    const { recipients, companyName } = await companyNotifyTarget(
      supabase,
      companyId,
    );
    if (recipients.length === 0) return;
    const { subject, html } = avisoEmail({
      companyName,
      title: opts.title,
      message: opts.message,
      portalUrl,
    });
    await sendEmail({ to: recipients, subject, html });
  }

  if (opts.companyId) {
    await sendTo(opts.companyId);
    return;
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("active", true);
  for (const co of companies ?? []) {
    await sendTo(co.id as string);
  }
}

/**
 * Avisa o contador que o cliente pediu a 2ª via de um boleto vencido.
 * Best-effort (não bloqueia a ação): manda e-mail para o contador se houver
 * destinatário; o pedido em si já ficou registrado na tabela do banco.
 */
export async function notifyReissueRequest(opts: {
  companyId: string;
  type: DocType;
  competencia: string | null;
  amount: number | null;
  dueDate: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const [{ companyName }, { recipients }] = await Promise.all([
    companyNotifyTarget(supabase, opts.companyId),
    adminNotifyTarget(supabase),
  ]);
  if (recipients.length === 0) return;

  const { subject, html } = segundaViaEmail({
    companyName,
    type: opts.type,
    competencia: opts.competencia,
    amount: opts.amount,
    dueDate: opts.dueDate,
    painelUrl: `${portalBase()}/painel`,
  });
  await sendEmail({ to: recipients, subject, html });
}
