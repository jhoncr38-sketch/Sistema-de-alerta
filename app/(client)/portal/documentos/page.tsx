import { Info } from "lucide-react";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { getActiveCompanyId } from "@/lib/companies";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function PortalDocumentosPage() {
  const supabase = await createClient();
  // RLS limita aos documentos das empresas do cliente; aqui filtramos a empresa ativa.
  const activeCompanyId = await getActiveCompanyId();
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "documento")
    .eq("company_id", activeCompanyId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Documentos da empresa: cartão CNPJ, contrato social, alvará, licenças"
      />
      <div className="space-y-4 p-6">
        <DocumentsTable
          documents={docs}
          showPreview
          showDownload
          emptyMessage="Nenhum documento disponível. Aqui ficam os documentos da empresa publicados pelo seu contador."
        />

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Use “Visualizar” para abrir o documento na tela ou “Baixar” para
          salvar. Boletos ficam em “Meus boletos” e a folha mensal em “Folha de
          pagamento”.
        </div>
      </div>
    </>
  );
}
