import { Info } from "lucide-react";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

export default async function PortalFolhaPage() {
  const supabase = await createClient();
  // RLS limita os documentos à empresa do próprio cliente.
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "folha")
    .order("competencia_month", { ascending: false, nullsFirst: false });

  const docs = (data ?? []) as DocumentWithCompany[];

  return (
    <>
      <PageHeader
        title="Folha de pagamento"
        subtitle="Folhas mensais enviadas pelo seu contador"
      />
      <div className="space-y-4 p-6">
        <DocumentsTable
          documents={docs}
          showDownload
          emptyMessage="Nenhuma folha disponível. Quando seu contador publicar a folha do mês, ela aparece aqui."
        />

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Cada folha é referente a um mês (competência). As mais recentes
          aparecem primeiro.
        </div>
      </div>
    </>
  );
}
