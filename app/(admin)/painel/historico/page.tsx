import Link from "next/link";
import { Mail, MonitorSmartphone, X } from "lucide-react";
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

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { empresa } = await searchParams;
  const supabase = await createClient();
  // Com ?empresa= (link "Ver tudo" da tela Clientes), só os alertas dela.
  let query = supabase
    .from("notifications")
    .select(
      empresa
        ? "id,channel,kind,sent_at,document:documents!inner(company_id,type,competencia,company:companies(razao_social,nome_fantasia))"
        : "id,channel,kind,sent_at,document:documents(type,competencia,company:companies(razao_social,nome_fantasia))",
    )
    .order("sent_at", { ascending: false })
    .limit(100);
  if (empresa) query = query.eq("document.company_id", empresa);
  const [{ data }, { data: empresaRow }] = await Promise.all([
    query,
    empresa
      ? supabase.from("companies").select("razao_social,nome_fantasia").eq("id", empresa).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const items = (data ?? []) as unknown as NotificationJoined[];
  const nomeEmpresa = empresaRow
    ? (empresaRow as { razao_social: string; nome_fantasia: string | null }).nome_fantasia ||
      (empresaRow as { razao_social: string }).razao_social
    : null;

  return (
    <>
      <PageHeader
        title="Histórico"
        subtitle="Alertas de vencimento enviados aos clientes"
      />
      <div className="p-6">
        {nomeEmpresa ? (
          <Link
            href="/painel/historico"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
          >
            {nomeEmpresa}
            <X className="size-3" />
          </Link>
        ) : null}
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
