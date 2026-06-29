import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { UploadForm } from "./upload-form";

export default async function EnviarPage() {
  const supabase = await createClient();
  const [{ data }, { data: revData }] = await Promise.all([
    supabase
      .from("companies")
      .select("*")
      .eq("active", true)
      .order("razao_social"),
    // Faturamentos já lançados: usados para avisar duplicidade por mês/cliente.
    supabase.from("revenues").select("company_id, competencia, amount"),
  ]);

  const companies = ((data ?? []) as Company[]).map((c) => ({
    id: c.id,
    label: `${c.nome_fantasia || c.razao_social}${c.cnpj ? ` — ${c.cnpj}` : ""}`,
  }));

  const revenues = (
    (revData ?? []) as {
      company_id: string;
      competencia: string;
      amount: number;
    }[]
  ).map((r) => ({
    companyId: r.company_id,
    competencia: r.competencia,
    amount: Number(r.amount),
  }));

  return (
    <>
      <PageHeader
        title="Enviar documento"
        subtitle="Anexe um boleto e publique para o cliente"
      />
      <div className="p-6">
        {companies.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem clientes ativos. Aprove um cadastro em{" "}
            <Link href="/painel/clientes" className="text-primary hover:underline">
              Clientes
            </Link>{" "}
            antes de enviar documentos.
          </Card>
        ) : (
          <Card className="max-w-3xl px-6 py-6">
            <UploadForm companies={companies} revenues={revenues} />
          </Card>
        )}
      </div>
    </>
  );
}
