import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

const resend = apiKey ? new Resend(apiKey) : null;

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "ContAlert <onboarding@resend.dev>";

/**
 * Envia um e-mail via Resend. Se RESEND_API_KEY não estiver configurada,
 * apenas registra no log (não quebra o fluxo) — útil em desenvolvimento.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY ausente — não enviado: "${subject}"`);
    return { skipped: true as const };
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[email] erro ao enviar:", error);
    return { error };
  }
  return { ok: true as const };
}
