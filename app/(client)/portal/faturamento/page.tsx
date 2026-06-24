import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { RevenueCharts } from "@/components/revenue-charts";
import { getUserAndProfile } from "@/lib/auth";
import {
  buildFaturamento,
  MONTHS_SHOWN,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function formatPct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

export default async function PortalFaturamentoPage() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  // RLS limita documents/revenues à empresa do próprio cliente.
  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase.from("documents").select("type, competencia, amount"),
    supabase.from("revenues").select("competencia, amount"),
  ]);

  const { data, totalFaturamento, totalTributos, cargaMedia, crescimento } =
    buildFaturamento(
      (docsRaw ?? []) as DocInput[],
      (revenuesRaw ?? []) as RevenueInput[],
    );

  const companyName =
    profile?.company?.nome_fantasia || profile?.company?.razao_social || "";
  const hasData = data.length > 0;

  return (
    <>
      <PageHeader
        title="Meu faturamento"
        subtitle={
          companyName
            ? `Faturamento e carga tributária — ${companyName}`
            : "Faturamento e carga tributária"
        }
      />
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
            Seu contador ainda não registrou o faturamento. Assim que ele
            informar, seus gráficos aparecem aqui.
          </Card>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Os valores de faturamento e impostos são lançados pelo seu contador.
        </div>
      </div>
    </>
  );
}
