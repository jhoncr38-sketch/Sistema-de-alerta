import { TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { RevenueCharts } from "@/components/revenue-charts";
import {
  buildFaturamento,
  MONTHS_SHOWN,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const CARTEIRA = "all";

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

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

  const { data, totalFaturamento, totalTributos, cargaMedia, crescimento } =
    buildFaturamento(
      (docsRaw ?? []) as DocInput[],
      (revenuesRaw ?? []) as RevenueInput[],
    );

  const hasData = data.length > 0;
  const subtitleAlvo = isCarteira
    ? "carteira (todos os clientes)"
    : selected!.nome_fantasia || selected!.razao_social;

  return (
    <>
      <PageHeader
        title="Faturamento"
        subtitle={`Faturamento e carga tributária — ${subtitleAlvo}`}
      >
        <form method="get" className="flex items-center gap-2">
          <select name="cliente" defaultValue={selectedValue} className={selectClass}>
            <option value={CARTEIRA}>📊 Todos os clientes (carteira)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome_fantasia || c.razao_social}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Ver
          </Button>
        </form>
      </PageHeader>

      <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Faturamento no período"
            value={formatCurrency(totalFaturamento)}
            sub={`últimos ${data.length || MONTHS_SHOWN} meses`}
          />
          <MetricCard
            label="Tributos no período"
            value={formatCurrency(totalTributos)}
            sub="DAS, DARF, INSS, ISS"
          />
          <MetricCard
            label="Carga tributária média"
            value={cargaMedia === null ? "—" : formatPct(cargaMedia)}
            sub="imposto / faturamento"
            tone={
              cargaMedia === null
                ? "muted"
                : cargaMedia >= 20
                  ? "danger"
                  : cargaMedia >= 12
                    ? "warning"
                    : "success"
            }
          />
          <MetricCard
            label="Crescimento no último mês"
            value={
              crescimento === null
                ? "—"
                : `${crescimento >= 0 ? "+" : ""}${formatPct(crescimento)}`
            }
            sub="vs. mês anterior"
            tone={
              crescimento === null
                ? "muted"
                : crescimento >= 0
                  ? "success"
                  : "danger"
            }
            icon={
              crescimento === null ? undefined : crescimento >= 0 ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )
            }
          />
        </div>

        {hasData ? (
          <RevenueCharts data={data} />
        ) : (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhum faturamento lançado ainda. Informe o faturamento do mês ao
            enviar um documento em “Enviar documento”.
          </Card>
        )}
      </div>
    </>
  );
}
