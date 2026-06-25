import { Info } from "lucide-react";
import { FaturamentoDashboard } from "@/components/faturamento-dashboard";
import { PageHeader } from "@/components/page-header";
import { getUserAndProfile } from "@/lib/auth";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { createClient } from "@/lib/supabase/server";

export default async function PortalFaturamentoPage() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  // RLS limita documents/revenues à empresa do próprio cliente.
  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase.from("documents").select("type, competencia, amount"),
    supabase.from("revenues").select("competencia, amount"),
  ]);

  // 24 meses de histórico para o filtro de período ter o que recortar.
  const { data } = buildFaturamento(
    (docsRaw ?? []) as DocInput[],
    (revenuesRaw ?? []) as RevenueInput[],
    24,
  );

  const companyName =
    profile?.company?.nome_fantasia || profile?.company?.razao_social || "";

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
        <FaturamentoDashboard
          data={data}
          emptyMessage="Seu contador ainda não registrou o faturamento. Assim que ele informar, seus gráficos aparecem aqui."
        />

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Os valores de faturamento e impostos são lançados pelo seu contador.
        </div>
      </div>
    </>
  );
}
