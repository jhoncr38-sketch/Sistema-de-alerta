import { Mail, MonitorSmartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { docTypeLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  vencido: "Boleto vencido",
  vence_hoje: "Vence hoje",
  dias_1: "Vence amanhã",
  dias_3: "Faltam 3 dias",
};

interface NotificationJoined {
  id: string;
  channel: "email" | "portal";
  kind: string;
  sent_at: string;
  document: {
    type: DocType;
    competencia: string;
    company: { razao_social: string; nome_fantasia: string | null } | null;
  } | null;
}

export default async function HistoricoPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(
      "id,channel,kind,sent_at,document:documents(type,competencia,company:companies(razao_social,nome_fantasia))",
    )
    .order("sent_at", { ascending: false })
    .limit(100);

  const items = (data ?? []) as unknown as NotificationJoined[];

  return (
    <>
      <PageHeader
        title="Histórico"
        subtitle="Alertas de vencimento enviados aos clientes"
      />
      <div className="p-6">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum alerta enviado ainda. O envio acontece automaticamente
            quando um vencimento se aproxima.
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {n.channel === "email" ? (
                    <Mail className="size-4" />
                  ) : (
                    <MonitorSmartphone className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    <span className="font-medium">
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                    {" — "}
                    {n.document
                      ? `${n.document.company?.nome_fantasia || n.document.company?.razao_social || "Cliente"} · ${docTypeLabel(n.document.type)}`
                      : "documento removido"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {n.channel === "email" ? "E-mail" : "Portal"} ·{" "}
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
