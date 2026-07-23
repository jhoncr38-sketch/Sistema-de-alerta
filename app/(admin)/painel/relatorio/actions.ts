"use server";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { competenciaExtenso } from "@/lib/ai/resumo";
import { companyNotifyTarget } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/resend";
import { resumoMensalEmail } from "@/lib/email/templates";
import { montarRelatorio, type RelatorioDoc } from "@/lib/relatorio";
import type { RevenueInput } from "@/lib/faturamento";

/**
 * Envia ao cliente, por e-mail, o resumo do relatório mensal — quando o contador
 * decidir (não é automático). Recalcula os números no servidor (mesma função da
 * página), então o conteúdo é sempre íntegro. Só o contador pode disparar.
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
  const [{ data: docsRaw }, { data: revenuesRaw }, target] = await Promise.all([
    admin
      .from("documents")
      .select(
        "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
      )
      .eq("company_id", companyId),
    admin.from("revenues").select("competencia, amount").eq("company_id", companyId),
    companyNotifyTarget(admin, companyId),
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

  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { subject, html } = resumoMensalEmail({
    companyName: target.companyName,
    competenciaLabel: competenciaExtenso(competencia),
    texto: model.resumoTexto,
    portalUrl: `${portalBase}/portal`,
  });

  const res = await sendEmail({ to: target.recipients, subject, html });
  if ("error" in res) {
    return { ok: false, message: "Não consegui enviar o e-mail. Tente de novo." };
  }
  if ("skipped" in res) {
    return { ok: false, message: "Envio de e-mail não está configurado (RESEND_API_KEY)." };
  }
  return {
    ok: true,
    message: `Relatório enviado para ${target.recipients.length} ${
      target.recipients.length === 1 ? "destinatário" : "destinatários"
    }.`,
  };
}
