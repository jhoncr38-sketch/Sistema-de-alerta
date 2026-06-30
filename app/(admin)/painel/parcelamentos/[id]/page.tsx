import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ParcelamentoDetail } from "@/components/parcelamento-detail";
import { DeletePlanButton } from "@/components/delete-plan-button";
import { AddParcelaButton } from "@/components/add-parcela-button";
import { modalidadeLabel } from "@/lib/constants";
import { summarizePlan } from "@/lib/parcelamento";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow, InstallmentPlanWithCompany } from "@/lib/types";

export default async function ParcelamentoDetalheAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: planRaw } = await supabase
    .from("installment_plans")
    .select("*, company:companies(id,razao_social,nome_fantasia)")
    .eq("id", id)
    .single();

  if (!planRaw) notFound();
  const plan = planRaw as unknown as InstallmentPlanWithCompany;

  const { data: parcelasRaw } = await supabase
    .from("documents")
    .select("*")
    .eq("plan_id", id)
    .order("parcela_num", { ascending: true });

  const parcelas = (parcelasRaw ?? []) as DocumentRow[];
  const companyName =
    plan.company?.nome_fantasia || plan.company?.razao_social || undefined;

  // Próximo número sugerido = última anexada + 1 (limitado ao total).
  const maxNum = parcelas.reduce((m, p) => Math.max(m, p.parcela_num ?? 0), 0);
  const nextNum = Math.min(maxNum + 1, plan.total);
  const podeAdicionar = parcelas.length < plan.total;

  return (
    <>
      <PageHeader
        title={plan.nome}
        subtitle={`${companyName ?? "Cliente"} · ${modalidadeLabel(plan.modalidade)} · ${parcelas.length}/${plan.total} guias`}
      >
        {podeAdicionar && plan.forma_pagamento !== "debito_automatico" ? (
          <AddParcelaButton planId={plan.id} nextNum={nextNum} total={plan.total} />
        ) : null}
        <DeletePlanButton planId={plan.id} nome={plan.nome} companyName={companyName} />
      </PageHeader>
      <div className="p-6">
        <ParcelamentoDetail
          summary={summarizePlan(plan.total, parcelas)}
          parcelas={parcelas}
          showPaid
          formaPagamento={plan.forma_pagamento}
          showDelete
          showEdit={plan.forma_pagamento === "debito_automatico"}
          showRequireProof
        />
      </div>
    </>
  );
}
