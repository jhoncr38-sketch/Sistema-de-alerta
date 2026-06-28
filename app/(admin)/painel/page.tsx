import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Users } from "lucide-react";
import { AlertBanner } from "@/components/alert-banner";
import { DocumentsTable } from "@/components/documents-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getUrgency } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

/** Documento com a forma de pagamento do parcelamento (quando for parcela). */
type PainelDoc = DocumentWithCompany & {
  plan: { forma_pagamento: string } | null;
};

/**
 * Parcela de débito automático que vence a mais de 7 dias. Como o débito gera
 * todas as parcelas de uma vez, escondemos as futuras da lista "em aberto" —
 * elas continuam no detalhe do parcelamento. Só aparecem aqui as vencidas ou a
 * vencer em ≤7 dias (as acionáveis). Mesma regra do portal do cliente.
 */
function ehDebitoAutomaticoFuturo(d: PainelDoc): boolean {
  if (d.categoria !== "parcelamento") return false;
  if (d.plan?.forma_pagamento !== "debito_automatico") return false;
  if (!d.due_date) return false;
  return getUrgency(d.due_date, d.status).urgency === "em_dia";
}

export default async function PainelPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: docsRaw }] = await Promise.all([
    supabase.from("companies").select("id").eq("active", true),
    supabase
      .from("documents")
      .select(
        "*, company:companies(id,razao_social,nome_fantasia,email), plan:installment_plans(forma_pagamento)",
      )
      .order("due_date", { ascending: true }),
  ]);

  const docs = (docsRaw ?? []) as PainelDoc[];
  // Boletos e parcelas de parcelamento são "guias a pagar" — entram no resumo.
  const boletos = docs.filter(
    (d) => d.categoria === "boleto" || d.categoria === "parcelamento",
  );
  const open = boletos.filter((d) => d.status === "open");
  // Lista "em aberto": oculta as parcelas futuras de débito automático.
  const openList = open.filter((d) => !ehDebitoAutomaticoFuturo(d));

  let vencidosHoje = 0;
  let vencendo = 0;
  let vencidosHojeValor = 0;
  let vencendoValor = 0;
  for (const d of open) {
    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status);
    if (urgency === "vencido" || urgency === "vence_hoje") {
      vencidosHoje++;
      vencidosHojeValor += d.amount ?? 0;
    } else if (urgency === "proximos_3" || urgency === "proximos_7") {
      vencendo++;
      vencendoValor += d.amount ?? 0;
    }
  }
  const pagosBoletos = boletos.filter((d) => d.status === "paid");
  const pagos = pagosBoletos.length;
  const pagosValor = pagosBoletos.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalClientes = companies?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral das obrigações dos seus clientes"
      />
      <div className="space-y-6 p-6">
        {vencidosHoje > 0 ? (
          <AlertBanner tone="danger" icon={<AlertTriangle className="size-4" />}>
            <strong>
              {vencidosHoje} boleto{vencidosHoje > 1 ? "s" : ""}
            </strong>{" "}
            vencem hoje ou já venceram. Verifique abaixo e notifique seus
            clientes.
          </AlertBanner>
        ) : null}
        {vencendo > 0 ? (
          <AlertBanner tone="warning" icon={<Clock className="size-4" />}>
            <strong>
              {vencendo} boleto{vencendo > 1 ? "s" : ""}
            </strong>{" "}
            vencem nos próximos 7 dias. Mantenha seus clientes informados.
          </AlertBanner>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Clientes ativos"
            value={totalClientes}
            sub="empresas"
            tone="info"
            icon={<Users className="size-4" />}
          />
          <MetricCard
            label="Vencidos / hoje"
            value={vencidosHoje}
            sub={`${formatCurrency(vencidosHojeValor)} em atraso`}
            tone="danger"
            icon={<AlertTriangle className="size-4" />}
          />
          <MetricCard
            label="Vencendo em breve"
            value={vencendo}
            sub={`${formatCurrency(vencendoValor)} a vencer`}
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
          <h2 className="text-sm font-semibold">Próximas obrigações</h2>
          <DocumentsTable
            documents={openList.slice(0, 10)}
            showClient
            showDownload
            showPaid
            emptyMessage="Nenhuma obrigação em aberto. Publique um boleto em “Enviar documento”."
          />
        </section>
      </div>
    </>
  );
}
