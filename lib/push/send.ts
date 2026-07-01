import webpush from "web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envio de Web Push (server-only). Usa as chaves VAPID do ambiente e a
 * biblioteca `web-push` para assinar/criptografar o aviso. Quando o serviço de
 * push responde 404/410 (assinatura morta — aparelho trocado, navegador
 * reinstalado), a linha é apagada automaticamente: é a "faxina" que evita lixo
 * no banco, sem trabalho manual.
 */

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Para onde levar ao clicar (default: /portal/boletos). */
  url?: string;
  /** Agrupa avisos: um novo do mesmo boleto substitui o anterior. */
  tag?: string;
}

let configured = false;

/** Configura o VAPID uma vez; devolve false se faltar chave (push desligado). */
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@example.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

/** Há chaves VAPID configuradas? Útil para pular o push com segurança. */
export function pushConfigured(): boolean {
  return ensureConfigured();
}

/**
 * Envia um aviso a uma lista de assinaturas. Best-effort: erros de uma
 * assinatura não afetam as outras nem quebram o chamador (o cron).
 * Assinaturas mortas (404/410) são removidas do banco.
 */
export async function sendPushToSubscriptions(
  supabase: ReturnType<typeof createAdminClient>,
  subs: PushSub[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured() || subs.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
        // Demais erros (rede, 5xx do serviço de push): ignora nesta rodada.
      }
    }),
  );

  let removed = 0;
  if (dead.length > 0) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", dead);
    if (!error) removed = dead.length;
  }

  return { sent, removed };
}
