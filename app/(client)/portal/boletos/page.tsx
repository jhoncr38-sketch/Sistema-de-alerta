import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { getActiveCompanyId } from "@/lib/companies";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function MeusBoletosPage() {
  const supabase = await createClient();
  const activeCompanyId = await getActiveCompanyId();
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "boleto")
    .eq("company_id", activeCompanyId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader
        title="Meus boletos"
        subtitle="Baixe seus boletos e marque o que já foi pago"
      />
      <div className="p-6">
        <DocumentsTable
          documents={docs}
          showPreview
          showDownload
          showPaid
          emptyMessage="Nenhum boleto disponível no momento."
        />
      </div>
    </>
  );
}
