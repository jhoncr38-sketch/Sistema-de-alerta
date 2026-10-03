import { FaturamentoDashboard } from "@/components/faturamento-dashboard";
import { PortalHeader } from "@/components/portal/portal-header";
import { getClientCompanyContext } from "@/lib/companies";
import {
  buildFaturamento,
  type DocInput,
  type RevenueInput,
} from "@/lib/faturamento";
import { createClient } from "@/lib/supabase/server";

export default async function PortalFaturamentoPage() {
  const supabase = await createClient();
  const { active } = await getClientCompanyContext();
  const activeId = active?.id ?? "00000000-0000-0000-0000-000000000000";

  // RLS limita às empresas do cliente; aqui filtramos a empresa ativa.
  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select("type, competencia, amount")
      .eq("company_id", activeId),
    supabase
      .from("revenues")
      .select("competencia, amount")
      .eq("company_id", activeId),
  ]);

  // 24 meses de histórico para o filtro de período ter o que recortar.
  const { data } = buildFaturamento(
    (docsRaw ?? []) as DocInput[],
    (revenuesRaw ?? []) as RevenueInput[],
    24,
  );

  return (
    <>
      <PortalHeader title="Meu faturamento" tela="faturamento" />
      <div className="space-y-6 p-6">
        <FaturamentoDashboard
          data={data}
          emptyMessage="Seu contador ainda não registrou o faturamento. Assim que ele informar, seus gráficos aparecem aqui."
        />
      </div>
    </>
  );
}
