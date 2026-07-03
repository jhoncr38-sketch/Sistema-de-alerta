// Avisos do SJ Rewards (Clube SJ) por e-mail: subiu de nível e novas conquistas.
// Server-only. Best-effort: uma falha de e-mail nunca quebra a navegação. A
// idempotência vem das próprias tabelas de rewards (só chega aqui o que ACABOU
// de acontecer), então não há risco de reenviar o mesmo aviso.
import { companyNotifyTarget } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/resend";
import { conquistaEmail, nivelAlcancadoEmail } from "@/lib/email/templates";
import { ACHIEVEMENTS, LEVELS } from "@/lib/rewards";
import { createAdminClient } from "@/lib/supabase/admin";

function portalBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function notifyRewardsEvents(
  companyId: string,
  events: { levelUp?: string | null; achievements?: string[] },
): Promise<void> {
  const levelUp = events.levelUp ?? null;
  const achievements = events.achievements ?? [];
  if (!levelUp && achievements.length === 0) return;

  const supabase = createAdminClient();
  const { recipients, companyName } = await companyNotifyTarget(
    supabase,
    companyId,
  );
  if (recipients.length === 0) return; // sem e-mail cadastrado

  const portalUrl = `${portalBase()}/portal/rewards`;

  if (levelUp) {
    const level = LEVELS.find((l) => l.id === levelUp);
    if (level) {
      const { subject, html } = nivelAlcancadoEmail({
        companyName,
        levelName: level.name,
        perks: level.perks,
        portalUrl,
      });
      await sendEmail({ to: recipients, subject, html });
    }
  }

  const defs = achievements
    .map((k) => ACHIEVEMENTS.find((a) => a.id === k))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => ({ name: a.name, description: a.description }));
  if (defs.length > 0) {
    const { subject, html } = conquistaEmail({
      companyName,
      achievements: defs,
      portalUrl,
    });
    await sendEmail({ to: recipients, subject, html });
  }
}
