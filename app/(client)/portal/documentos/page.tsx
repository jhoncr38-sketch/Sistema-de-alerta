import { Info } from "lucide-react";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function PortalDocumentosPage() {
  const supabase = await createClient();
  // RLS limita os documentos à empresa do próprio cliente.
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "documento")
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Relatórios, folhas e informativos enviados pelo seu contador"
      />
      <div className="space-y-4 p-6">
        <DocumentsTable
          documents={docs}
          showDownload
          emptyMessage="Nenhum documento disponível. Quando seu contador publicar um relatório ou informativo, ele aparece aqui."
        />

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Documentos são apenas para leitura/baixar — não têm valor nem
          vencimento. Boletos a pagar ficam na aba “Meus boletos”.
        </div>
      </div>
    </>
  );
}
