import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type ClientEventType =
  | "portal_access"
  | "view_boletos"
  | "view_parcelamentos"
  | "view_parcelamento";

export const EVENT_LABEL: Record<ClientEventType, string> = {
  portal_access: "Acessou o portal",
  view_boletos: "Visualizou boletos",
  view_parcelamentos: "Visualizou parcelamentos",
  view_parcelamento: "Abriu um parcelamento",
};

/**
 * Registra um evento de acesso do cliente após a resposta ser enviada,
 * sem bloquear o carregamento da página.
 */
export function trackClientEvent(opts: {
  clientId: string;
  companyId?: string | null;
  eventType: ClientEventType;
  planId?: string | null;
}) {
  after(async () => {
    const supabase = await createClient();
    await supabase.from("client_events").insert({
      client_id: opts.clientId,
      company_id: opts.companyId ?? null,
      event_type: opts.eventType,
      plan_id: opts.planId ?? null,
    });
  });
}
