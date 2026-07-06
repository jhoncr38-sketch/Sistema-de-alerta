import { AlertTriangle, CalendarClock, CheckCircle2, Info } from "lucide-react";
import { DocumentsTable } from "@/components/documents-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProximoVencimento } from "@/components/proximo-vencimento";
import { getUserAndProfile } from "@/lib/auth";
import { getClientCompanyContext } from "@/lib/companies";
import { getUrgency } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

/** Documento com a forma de pagamento do parcelamento (quando for parcela). */
type PortalDoc = DocumentWithCompany & {
  plan: { forma_pagamento: string } | null;
};

/**
 * Parcela de débito automático que vence a mais de 7 dias. Como o débito gera
 * todas as parcelas de uma vez, escondemos as futuras da lista "em aberto" —
 * elas continuam no detalhe do parcelamento. Só aparecem aqui as vencidas ou a
 * vencer em ≤7 dias (as acionáveis).
 */
function ehDebitoAutomaticoFuturo(d: PortalDoc): boolean {
  if (d.categoria !== "parcelamento") return false;
  if (d.plan?.forma_pagamento !== "debito_automatico") return false;
  if (!d.due_date) return false;
  return getUrgency(d.due_date, d.status).urgency === "em_dia";
}

export default async function PortalHome() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();
  const { active } = await getClientCompanyContext();
  const activeId = active?.id ?? "00000000-0000-0000-0000-000000000000";
  const { data } = await supabase
    .from("documents")
    .select(
      "*, company:companies(id,razao_social,nome_fantasia,email), plan:installment_plans(forma_pagamento)",
    )
    .eq("company_id", activeId)
    .order("due_date", { ascending: true });

  const docs = (data ?? []) as PortalDoc[];
  // Boletos e parcelas de parcelamento são "guias a pagar" — entram no resumo.
  const pagaveis = docs.filter(
    (d) => d.categoria === "boleto" || d.categoria === "parcelamento",
  );
  // Métricas de vencido/vencendo olham só o que ainda está em aberto de fato.
  const open = pagaveis.filter((d) => d.status === "open");
  // Lista visível "em aberto": inclui o que aguarda confirmação (selo âmbar,
  // botão travado), mas oculta as parcelas futuras de débito automático.
  const openList = pagaveis
    .filter((d) => d.status !== "paid")
    .filter((d) => !ehDebitoAutomaticoFuturo(d));

  let vencidos = 0;
  let emBreve = 0;
  let vencidosValor = 0;
  let emBreveValor = 0;
  for (const d of open) {
    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status);
    if (urgency === "vencido") {
      vencidos++;
      vencidosValor += d.amount ?? 0;
    }
    if (["vence_hoje", "proximos_3", "proximos_7"].includes(urgency)) {
      emBreve++;
      emBreveValor += d.amount ?? 0;
    }
  }
  const pagosPagaveis = pagaveis.filter((d) => d.status === "paid");
  const pagos = pagosPagaveis.length;
  const pagosValor = pagosPagaveis.reduce((s, d) => s + (d.amount ?? 0), 0);

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
        <ProximoVencimento open={openList} />

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Vencidos"
            value={vencidos}
            sub={`${formatCurrency(vencidosValor)} em atraso`}
            tone="danger"
            icon={<AlertTriangle className="size-4" />}
          />
          <MetricCard
            label="Vencem em breve"
            value={emBreve}
            sub={`${formatCurrency(emBreveValor)} a vencer`}
            tone="warning"
            icon={<CalendarClock className="size-4" />}
          />
          <MetricCard
            label="Pagos"
            value={pagos}
            sub={`${formatCurrency(pagosValor)} quitados`}
            tone="success"
            icon={<CheckCircle2 className="size-4" />}
          />
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Boletos e parcelas em aberto</h2>
          <DocumentsTable
            documents={openList}
            showPreview
            showDownload
            showPaid
            enforceProof
            showTypeIcon
            showExplain
            emptyMessage="Você não tem boletos ou parcelas em aberto."
          />
        </section>

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Dúvidas sobre algum boleto? Use o assistente no canto da tela ou fale
          com seu contador.
        </div>
      </div>
    </>
  );
}
