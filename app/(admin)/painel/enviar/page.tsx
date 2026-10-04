import Link from "next/link";
import { Landmark, Paperclip, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/collapsible-section";
import { EnvioLote } from "@/components/lote/envio-lote";
import { PainelReceita } from "@/components/painel-receita";
import { PageHeader } from "@/components/page-header";
import { serproConfigurado } from "@/lib/serpro/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UploadForm } from "./upload-form";

type Aba = "pdfs" | "receita";

/**
 * Enviar documento — duas abas:
 *   • Enviar PDFs: arrasta os PDFs (a IA reconhece cada guia) + envio à mão.
 *   • Receita Federal: escolhe o cliente e vê o que ele tem em aberto na
 *     Receita (DAS, parcelas), com DARF e situação fiscal logo abaixo.
 */
export default async function EnviarPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; empresa?: string }>;
}) {
  const { aba: abaParam, empresa } = await searchParams;
  const aba: Aba = abaParam === "receita" ? "receita" : "pdfs";

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

  // A Receita só atende clientes com CNPJ.
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

  const abas: { key: Aba; rotulo: string; icon: React.ReactNode }[] = [
    { key: "pdfs", rotulo: "Enviar PDFs", icon: <Upload className="size-4" /> },
    { key: "receita", rotulo: "Receita Federal", icon: <Landmark className="size-4" /> },
  ];

  return (
    <>
      <PageHeader
        title="Enviar documento"
        subtitle="Publique guias e documentos no portal dos clientes"
      />
      <div className="space-y-5 p-6">
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
            <div role="tablist" className="flex w-fit rounded-lg bg-muted p-[3px]">
              {abas.map((a) => (
                <Link
                  key={a.key}
                  href={a.key === "pdfs" ? "/painel/enviar" : "/painel/enviar?aba=receita"}
                  role="tab"
                  aria-selected={aba === a.key}
                  scroll={false}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-sm whitespace-nowrap",
                    aba === a.key
                      ? "bg-card font-semibold shadow-sm"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {a.icon}
                  {a.rotulo}
                </Link>
              ))}
            </div>

            {aba === "pdfs" ? (
              <>
                <EnvioLote clientes={companies} />
                {/* Envio à mão — um arquivo por vez, para casos especiais.
                    (mesma largura da área de arrastar) */}
                <div className="[&>div]:max-w-none">
                <CollapsibleSection
                  title="Preencher um à mão"
                  subtitle="Um boleto, documento da empresa ou folha — com todos os campos"
                  icon={<Paperclip />}
                >
                  <UploadForm companies={companies} revenues={revenues} />
                </CollapsibleSection>
                </div>
              </>
            ) : dasCompanies.length > 0 ? (
              <PainelReceita companies={dasCompanies} configurado={serproOn} empresaInicial={empresa} />
            ) : (
              <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente ativo com CNPJ — a Receita só atende CNPJ.
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
