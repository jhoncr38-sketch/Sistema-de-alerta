import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ParcelamentoCard } from "@/components/parcelamento-card";
import { CompanyFilterSelect } from "@/components/company-filter-select";
import { summarizePlan, type ParcelaLike } from "@/lib/parcelamento";
import { createClient } from "@/lib/supabase/server";

interface PlanRow {
  id: string;
  nome: string;
  total: number;
  forma_pagamento: string;
  company: { id: string; razao_social: string; nome_fantasia: string | null } | null;
  parcelas: ParcelaLike[];
}

export default async function ParcelamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("installment_plans")
    .select(
      "id, nome, total, forma_pagamento, company:companies(id,razao_social,nome_fantasia), parcelas:documents(status,amount,due_date)",
    )
    .order("created_at", { ascending: false });

  const plans = (data ?? []) as unknown as PlanRow[];

  // Empresas que têm parcelamento (o filtro só lista quem realmente aparece
  // aqui — não polui com clientes sem nenhum plano). Ordenadas por nome.
  const companyMap = new Map<string, string>();
  for (const p of plans) {
    if (p.company) {
      companyMap.set(
        p.company.id,
        p.company.nome_fantasia || p.company.razao_social,
      );
    }
  }
  const companyOptions = Array.from(companyMap, ([id, label]) => ({
    id,
    label,
  })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  // Aplica o filtro selecionado (empresa ativa via ?company=<id>).
  const filtrados = sp.company
    ? plans.filter((p) => p.company?.id === sp.company)
    : plans;

  return (
    <>
      <PageHeader
        title="Parcelamentos"
        subtitle="Parcelamentos de débitos por cliente"
      >
        {/* O filtro só aparece quando há 2+ empresas com parcelamento. */}
        {companyOptions.length >= 2 ? (
          <CompanyFilterSelect
            options={companyOptions}
            value={sp.company ?? ""}
            allLabel="Todas as empresas"
          />
        ) : null}
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/painel/parcelamentos/novo">
              <Plus />
              Novo parcelamento
            </Link>
          }
        />
      </PageHeader>

      <div className="p-6">
        {plans.length === 0 ? (
          <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum parcelamento cadastrado.{" "}
            <Link
              href="/painel/parcelamentos/novo"
              className="text-primary hover:underline"
            >
              Criar o primeiro
            </Link>
            .
          </Card>
        ) : filtrados.length === 0 ? (
          <Card className="px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum parcelamento para esta empresa.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((plan) => (
              <ParcelamentoCard
                key={plan.id}
                nome={plan.nome}
                href={`/painel/parcelamentos/${plan.id}`}
                companyName={
                  plan.company?.nome_fantasia || plan.company?.razao_social || undefined
                }
                formaPagamento={plan.forma_pagamento}
                summary={summarizePlan(plan.total, plan.parcelas ?? [])}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
