import { Bell } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getActiveCompanyId } from "@/lib/companies";
import { docTypeLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  vencido: "Boleto vencido",
  vence_hoje: "Boleto vence hoje",
  dias_3: "Boleto vence em 3 dias",
  dias_7: "Boleto vence em 7 dias",
  parcela_risco: "Parcela em atraso (risco de exclusão)",
  novo_doc: "Novo documento disponível",
  pago: "Pagamento confirmado",
};

interface NotificationJoined {
  id: string;
  channel: "email" | "portal";
  kind: string;
  sent_at: string;
  document: { type: DocType; competencia: string; company_id: string } | null;
}

export default async function NotificacoesPage() {
  const supabase = await createClient();
  const activeCompanyId = await getActiveCompanyId();
  const { data } = await supabase
    .from("notifications")
    .select("id,channel,kind,sent_at,document:documents(type,competencia,company_id)")
    .order("sent_at", { ascending: false })
    .limit(200);

  // RLS já restringe às empresas do cliente; aqui mantemos só a empresa ativa.
  const items = ((data ?? []) as unknown as NotificationJoined[]).filter(
    (n) => n.document?.company_id === activeCompanyId,
  );

  return (
    <>
      <PageHeader title="Notificações" subtitle="Avisos sobre seus vencimentos" />
      <div className="p-6">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Você ainda não recebeu notificações.
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {KIND_LABEL[n.kind] ?? n.kind}
                    {n.document ? ` — ${docTypeLabel(n.document.type)}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(n.sent_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
