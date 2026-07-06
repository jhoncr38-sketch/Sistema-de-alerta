import { Card } from "@/components/ui/card";
import { CompanyFilterSelect } from "@/components/company-filter-select";
import { FaturamentoDashboard } from "@/components/faturamento-dashboard";
import { PageHeader } from "@/components/page-header";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

const CARTEIRA = "all";

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("*")
    .eq("active", true)
    .order("razao_social");
  const companies = (companiesRaw ?? []) as Company[];

  if (companies.length === 0) {
    return (
      <>
        <PageHeader
          title="Faturamento"
          subtitle="Faturamento e carga tributária por cliente"
        />
        <div className="p-6">
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem clientes ativos. Aprove um cadastro em Clientes
            para acompanhar o faturamento.
          </Card>
        </div>
      </>
    );
  }

  // Seleção: id de uma empresa ou "all" (carteira agregada). Padrão: 1º cliente.
  const selectedValue = sp.cliente ?? companies[0].id;
  const isCarteira = selectedValue === CARTEIRA;
  const selected = isCarteira
    ? null
    : (companies.find((c) => c.id === selectedValue) ?? companies[0]);

  // RLS (admin) deixa o contador ver tudo; no modo por cliente, filtramos.
  let docsQuery = supabase
    .from("documents")
    .select("type, competencia, amount");
  let revQuery = supabase.from("revenues").select("competencia, amount");
  if (!isCarteira && selected) {
    docsQuery = docsQuery.eq("company_id", selected.id);
    revQuery = revQuery.eq("company_id", selected.id);
  }
  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    docsQuery,
    revQuery,
  ]);

  // 24 meses de histórico para o filtro de período ter o que recortar.
  const { data } = buildFaturamento(
    (docsRaw ?? []) as DocInput[],
    (revenuesRaw ?? []) as RevenueInput[],
    24,
  );

  const subtitleAlvo = isCarteira
    ? "carteira (todos os clientes)"
    : selected!.nome_fantasia || selected!.razao_social;

  return (
    <>
      <PageHeader
        title="Faturamento"
        subtitle={`Faturamento e carga tributária — ${subtitleAlvo}`}
      >
        <CompanyFilterSelect
          paramName="cliente"
          options={companies.map((c) => ({
            id: c.id,
            label: c.nome_fantasia || c.razao_social,
          }))}
          value={selectedValue}
          allLabel="📊 Todos os clientes (carteira)"
          allValue={CARTEIRA}
        />
      </PageHeader>

      <div className="space-y-6 p-6">
        <FaturamentoDashboard
          data={data}
          emptyMessage="Nenhum faturamento lançado ainda. Informe o faturamento do mês ao enviar um documento em “Enviar documento”."
        />
      </div>
    </>
  );
}
