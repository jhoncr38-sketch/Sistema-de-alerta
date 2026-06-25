import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Info } from "lucide-react";
import { AlertBanner } from "@/components/alert-banner";
import { DocumentsTable } from "@/components/documents-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getUserAndProfile } from "@/lib/auth";
import { getClientCompanyContext } from "@/lib/companies";
import { getUrgency } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function PortalHome() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();
  const { active } = await getClientCompanyContext();
  const activeId = active?.id ?? "00000000-0000-0000-0000-000000000000";
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("company_id", activeId)
    .order("due_date", { ascending: true });

  const docs = (data ?? []) as DocumentWithCompany[];
  const boletos = docs.filter((d) => d.categoria === "boleto");
  const open = boletos.filter((d) => d.status === "open");

  let vencidos = 0;
  let venceHoje = 0;
  let emBreve = 0;
  for (const d of open) {
    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status);
    if (urgency === "vencido") vencidos++;
    if (urgency === "vence_hoje") venceHoje++;
    if (["vence_hoje", "proximos_3", "proximos_7"].includes(urgency)) emBreve++;
  }
  const pagos = boletos.filter((d) => d.status === "paid").length;

  const companyName =
    active?.nome_fantasia ||
    active?.razao_social ||
    profile?.company?.nome_fantasia ||
    profile?.company?.razao_social ||
    "";

  return (
    <>
      <PageHeader
        title={companyName ? `Olá, ${companyName}!` : "Olá!"}
        subtitle="Confira seus boletos e documentos"
      />
      <div className="space-y-6 p-6">
        {vencidos > 0 ? (
          <AlertBanner tone="danger" icon={<AlertTriangle className="size-4" />}>
            <strong>Atenção:</strong> você tem {vencidos} boleto
            {vencidos > 1 ? "s" : ""} vencido{vencidos > 1 ? "s" : ""}. Efetue o
            pagamento para evitar multas.
          </AlertBanner>
        ) : null}
        {venceHoje > 0 ? (
          <AlertBanner tone="warning" icon={<Clock className="size-4" />}>
            {venceHoje} boleto{venceHoje > 1 ? "s" : ""} vence
            {venceHoje > 1 ? "m" : ""} <strong>hoje</strong>.
          </AlertBanner>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Vencidos"
            value={vencidos}
            sub="ação urgente"
            tone="danger"
            icon={<AlertTriangle className="size-4" />}
          />
          <MetricCard
            label="Vencem em breve"
            value={emBreve}
            sub="próximos 7 dias"
            tone="warning"
            icon={<CalendarClock className="size-4" />}
          />
          <MetricCard
            label="Pagos"
            value={pagos}
            sub="em dia"
            tone="success"
            icon={<CheckCircle2 className="size-4" />}
          />
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Boletos em aberto</h2>
          <DocumentsTable
            documents={open}
            showDownload
            showPaid
            emptyMessage="Você não tem boletos em aberto."
          />
        </section>

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Dúvidas sobre algum boleto? Fale com seu contador.
        </div>
      </div>
    </>
  );
}
