import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function MeusBoletosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader
        title="Meus boletos e documentos"
        subtitle="Baixe seus boletos e relatórios e marque o que já foi pago"
      />
      <div className="p-6">
        <DocumentsTable
          documents={docs}
          showDownload
          showPaid
          emptyMessage="Nenhum boleto ou documento disponível no momento."
        />
      </div>
    </>
  );
}
