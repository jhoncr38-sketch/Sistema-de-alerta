import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/alert-banner";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Company, DocumentWithCompany } from "@/lib/types";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("*")
    .order("razao_social");
  const companies = (companiesRaw ?? []) as Company[];

  let query = supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .order("due_date", { ascending: true });
  if (sp.company) query = query.eq("company_id", sp.company);
  const { data: docsRaw } = await query;
  const docs = (docsRaw ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader title="Documentos" subtitle="Todos os boletos publicados">
        <form method="get" className="flex items-center gap-2">
          <select name="company" defaultValue={sp.company ?? ""} className={selectClass}>
            <option value="">Todos os clientes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome_fantasia || c.razao_social}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrar
          </Button>
        </form>
      </PageHeader>

      <div className="space-y-4 p-6">
        {sp.ok ? (
          <AlertBanner tone="success" icon={<CheckCircle2 className="size-4" />}>
            Documento publicado com sucesso. O cliente já consegue baixá-lo.
          </AlertBanner>
        ) : null}

        <DocumentsTable
          documents={docs}
          showClient
          showDownload
          showPaid
          showDelete
          emptyMessage="Nenhum documento. Publique um boleto em “Enviar documento”."
        />
      </div>
    </>
  );
}
