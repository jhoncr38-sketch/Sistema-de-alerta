"use server";

import { requireAdmin } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { createAdminClient } from "@/lib/supabase/admin";
import { competenciaExtenso } from "@/lib/ai/resumo";
import { companyNotifyTarget } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/resend";
import { resumoMensalEmail } from "@/lib/email/templates";
import type { RevenueInput } from "@/lib/faturamento";
import {
  montarRelatorio,
  montarView,
  type RelatorioDoc,
} from "@/lib/relatorio";
import { fetchLogoDataUri, renderRelatorioPdf } from "@/lib/relatorio-pdf";

/**
 * Envia ao cliente, por e-mail, o relatório mensal COM O PDF ANEXADO — quando o
 * contador decidir (não é automático). Recalcula tudo no servidor (mesma função
 * da página), então o conteúdo é sempre íntegro. Se o PDF falhar, envia mesmo
 * assim (só o texto). Só o contador pode disparar.
 */
export async function enviarRelatorioCliente(
  companyId: string,
  competencia: string,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return { ok: false, message: "Mês inválido." };
  }

  const admin = createAdminClient();
  const [{ data: docsRaw }, { data: revenuesRaw }, { data: company }, target, branding] =
    await Promise.all([
      admin
        .from("documents")
        .select(
          "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
        )
        .eq("company_id", companyId),
      admin.from("revenues").select("competencia, amount").eq("company_id", companyId),
      admin.from("companies").select("cnpj").eq("id", companyId).single(),
      companyNotifyTarget(admin, companyId),
      getBranding(),
    ]);

  if (target.recipients.length === 0) {
    return {
      ok: false,
      message: "Este cliente não tem e-mail cadastrado para receber o relatório.",
    };
  }

  const model = montarRelatorio(
    (docsRaw ?? []) as RelatorioDoc[],
    (revenuesRaw ?? []) as RevenueInput[],
    competencia,
    target.companyName,
  );
  const view = montarView(model, {
    brandName: branding.name,
    logoUrl: branding.logoUrl,
    cnpj: (company as { cnpj: string | null } | null)?.cnpj ?? null,
  });

  // Gera o PDF (best-effort: se falhar, manda só o texto).
  let attachments: { filename: string; content: Buffer }[] | undefined;
  try {
    const logoData = await fetchLogoDataUri(branding.logoUrl);
    const pdf = await renderRelatorioPdf(view, logoData);
    attachments = [{ filename: `relatorio-${competencia}.pdf`, content: pdf }];
  } catch (e) {
    console.error("[relatorio] falha ao gerar PDF:", e);
  }

  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { subject, html } = resumoMensalEmail({
    companyName: target.companyName,
    competenciaLabel: competenciaExtenso(competencia),
    texto: model.resumoTexto,
    portalUrl: `${portalBase}/portal`,
  });

  const res = await sendEmail({ to: target.recipients, subject, html, attachments });
  if ("error" in res) {
    return { ok: false, message: "Não consegui enviar o e-mail. Tente de novo." };
  }
  if ("skipped" in res) {
    return { ok: false, message: "Envio de e-mail não está configurado (RESEND_API_KEY)." };
  }
  const comPdf = attachments ? " com o PDF anexado" : "";
  return {
    ok: true,
    message: `Relatório enviado${comPdf} para ${target.recipients.length} ${
      target.recipients.length === 1 ? "destinatário" : "destinatários"
    }.`,
  };
}
