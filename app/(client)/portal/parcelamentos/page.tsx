import { Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ParcelamentoCard } from "@/components/parcelamento-card";
import { getActiveCompanyId } from "@/lib/companies";
import { summarizePlan, type ParcelaLike } from "@/lib/parcelamento";
import { createClient } from "@/lib/supabase/server";

interface PlanRow {
  id: string;
  nome: string;
  total: number;
  parcelas: ParcelaLike[];
}

export default async function PortalParcelamentosPage() {
  const supabase = await createClient();
  const activeCompanyId = await getActiveCompanyId();
  const { data } = await supabase
    .from("installment_plans")
    .select("id, nome, total, parcelas:documents(status,amount,due_date)")
    .eq("company_id", activeCompanyId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false });

  const plans = (data ?? []) as unknown as PlanRow[];

  return (
    <>
      <PageHeader
        title="Parcelamentos"
        subtitle="Acompanhe seus parcelamentos e baixe as guias de cada parcela"
      />
      <div className="space-y-4 p-6">
        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Você não tem parcelamentos no momento.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <ParcelamentoCard
                key={plan.id}
                nome={plan.nome}
                href={`/portal/parcelamentos/${plan.id}`}
                summary={summarizePlan(plan.total, plan.parcelas ?? [])}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Abra um parcelamento para baixar a guia de cada parcela e marcar as que
          já foram pagas.
        </div>
      </div>
    </>
  );
}
