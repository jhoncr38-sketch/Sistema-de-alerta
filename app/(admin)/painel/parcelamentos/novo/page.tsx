import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { ParcelamentoForm } from "./parcelamento-form";

export default async function NovoParcelamentoPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("active", true)
    .order("razao_social");

  const companies = ((data ?? []) as Company[]).map((c) => ({
    id: c.id,
    label: `${c.nome_fantasia || c.razao_social}${c.cnpj ? ` — ${c.cnpj}` : ""}`,
  }));

  return (
    <>
      <PageHeader
        title="Novo parcelamento"
        subtitle="Crie o parcelamento e anexe todas as parcelas de uma vez"
      />
      <div className="p-6">
        {companies.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem clientes ativos. Aprove um cadastro em{" "}
            <Link href="/painel/clientes" className="text-primary hover:underline">
              Clientes
            </Link>{" "}
            antes de criar um parcelamento.
          </Card>
        ) : (
          <Card className="max-w-3xl px-6 py-6">
            <ParcelamentoForm companies={companies} />
          </Card>
        )}
      </div>
    </>
  );
}
