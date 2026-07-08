import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ReceitaFederalPanel } from "@/components/receita-federal-panel";
import { PageHeader } from "@/components/page-header";
import { serproConfigurado } from "@/lib/serpro/auth";
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

  const allCompanies = (data ?? []) as Company[];
  const companies = allCompanies.map((c) => ({
    id: c.id,
    label: `${c.nome_fantasia || c.razao_social}${c.cnpj ? ` — ${c.cnpj}` : ""}`,
  }));

  // Emitir DAS só faz sentido para clientes com CNPJ (a Receita exige).
  const dasCompanies = allCompanies
    .filter((c) => c.cnpj)
    .map((c) => ({
      id: c.id,
      label: `${c.nome_fantasia || c.razao_social} — ${c.cnpj}`,
      cnpj: c.cnpj,
    }));
  const serproOn = serproConfigurado();

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
      <div className="space-y-6 p-6">
        {companies.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem clientes ativos. Aprove um cadastro em{" "}
            <Link href="/painel/clientes" className="text-primary hover:underline">
              Clientes
            </Link>{" "}
            antes de enviar documentos.
          </Card>
        ) : (
          <>
            {/* Receita Federal (DAS, DARF/DCTFWeb, Situação fiscal) em abas. */}
            {dasCompanies.length > 0 ? (
              <ReceitaFederalPanel
                companies={dasCompanies}
                configurado={serproOn}
              />
            ) : null}

            {/* Envio manual — recolhido por padrão para não poluir a tela. */}
            <CollapsibleSection
              title="Envio manual"
              subtitle="Anexar um boleto ou documento à mão"
              icon={<Paperclip />}
            >
              <UploadForm companies={companies} revenues={revenues} />
            </CollapsibleSection>
          </>
        )}
      </div>
    </>
  );
}
