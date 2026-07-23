import { PageHeader } from "@/components/page-header";
import { RelatorioControls } from "@/components/relatorio-controls";
import { RelatorioSheet } from "@/components/relatorio-sheet";
import { getBranding } from "@/lib/branding";
import { currentCompetenciaKey } from "@/lib/dates";
import type { RevenueInput } from "@/lib/faturamento";
import {
  montarRelatorio,
  montarView,
  nextMonthKey,
  prevMonthKey,
  type RelatorioDoc,
} from "@/lib/relatorio";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { enviarRelatorioCliente } from "./actions";

/**
 * Relatório mensal ("prestação de contas") — SÓ no painel do contador. Ele
 * escolhe a empresa e o mês, salva em PDF (impressão) e decide quando enviar ao
 * cliente por e-mail (com o PDF anexado). `?empresa=<id>&mes=YYYY-MM` (padrão:
 * 1º cliente, mês anterior).
 */
export default async function PainelRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; mes?: string }>;
}) {
  const [supabase, branding, sp] = await Promise.all([
    createClient(),
    getBranding(),
    searchParams,
  ]);

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("*")
    .order("razao_social");
  const companies = (companiesRaw ?? []) as Company[];

  if (companies.length === 0) {
    return (
      <>
        <PageHeader
          title="Relatório do mês"
          subtitle="Prestação de contas para enviar ao cliente"
        />
        <div className="p-6">
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Cadastre uma empresa em Clientes para gerar o relatório.
          </div>
        </div>
      </>
    );
  }

  const selectedId =
    (sp.empresa && companies.find((c) => c.id === sp.empresa)?.id) ||
    companies[0].id;
  const company = companies.find((c) => c.id === selectedId) as Company;

  const currentKey = currentCompetenciaKey();
  const mesParam =
    typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  let competencia = mesParam ?? prevMonthKey(currentKey);
  if (competencia > currentKey) competencia = currentKey;

  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
      )
      .eq("company_id", selectedId),
    supabase
      .from("revenues")
      .select("competencia, amount")
      .eq("company_id", selectedId),
  ]);

  const companyName = company.nome_fantasia || company.razao_social;
  const model = montarRelatorio(
    (docsRaw ?? []) as RelatorioDoc[],
    (revenuesRaw ?? []) as RevenueInput[],
    competencia,
    companyName,
  );
  const view = montarView(model, {
    brandName: branding.name,
    logoUrl: branding.logoUrl,
    cnpj: company.cnpj ?? null,
  });

  const nextYm = nextMonthKey(competencia);

  return (
    <>
      <PageHeader
        title="Relatório do mês"
        subtitle="Prestação de contas para enviar ao cliente"
      />
      <div className="p-6">
        <RelatorioControls
          companies={companies.map((c) => ({
            id: c.id,
            label: c.nome_fantasia || c.razao_social,
          }))}
          selectedId={selectedId}
          competencia={competencia}
          badge={`${model.mesLabel} · ${model.ano}`}
          prevYm={prevMonthKey(competencia)}
          nextYm={nextYm <= currentKey ? nextYm : null}
          clienteNome={companyName}
          pdfHref={`/painel/relatorio/pdf?empresa=${selectedId}&mes=${competencia}`}
          sendAction={enviarRelatorioCliente.bind(null, selectedId, competencia)}
        />

        <RelatorioSheet {...view} />
      </div>
    </>
  );
}
