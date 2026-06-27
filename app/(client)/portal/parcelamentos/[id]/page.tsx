import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ParcelamentoDetail } from "@/components/parcelamento-detail";
import { modalidadeLabel } from "@/lib/constants";
import { summarizePlan } from "@/lib/parcelamento";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow, InstallmentPlan } from "@/lib/types";

export default async function PortalParcelamentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS garante que o cliente só lê os planos das empresas que pode acessar.
  const { data: planRaw } = await supabase
    .from("installment_plans")
    .select("*")
    .eq("id", id)
    .single();

  if (!planRaw) notFound();
  const plan = planRaw as InstallmentPlan;

  const { data: parcelasRaw } = await supabase
    .from("documents")
    .select("*")
    .eq("plan_id", id)
    .order("parcela_num", { ascending: true });

  const parcelas = (parcelasRaw ?? []) as DocumentRow[];

  return (
    <>
      <PageHeader title={plan.nome} subtitle={modalidadeLabel(plan.modalidade)}>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link href="/portal/parcelamentos">
              <ArrowLeft />
              Voltar
            </Link>
          }
        />
      </PageHeader>
      <div className="p-6">
        <ParcelamentoDetail
          summary={summarizePlan(plan.total, parcelas)}
          parcelas={parcelas}
          showPaid
          formaPagamento={plan.forma_pagamento}
        />
      </div>
    </>
  );
}
