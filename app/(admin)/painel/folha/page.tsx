import { CompanyFilterSelect } from "@/components/company-filter-select";
import { FolhaList } from "@/components/folha-list";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

function companyLabel(c: { nome_fantasia: string | null; razao_social: string }) {
  return c.nome_fantasia || c.razao_social;
}

export default async function FolhaPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Todas as folhas (para derivar as empresas do filtro); a filtragem por
  // empresa é aplicada em memória logo abaixo.
  const { data: docsRaw } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "folha")
    .order("competencia_month", { ascending: false, nullsFirst: false });
  const allDocs = (docsRaw ?? []) as DocumentWithCompany[];

  // Empresas que têm folha (o filtro só lista quem realmente aparece aqui).
  const companyMap = new Map<string, string>();
  for (const d of allDocs) {
    const id = d.company?.id ?? d.company_id;
    companyMap.set(id, d.company ? companyLabel(d.company) : "Cliente");
  }
  const companyOptions = Array.from(companyMap, ([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const docs = sp.company
    ? allDocs.filter((d) => (d.company?.id ?? d.company_id) === sp.company)
    : allDocs;

  // Com uma empresa filtrada, lista direta por mês. Sem filtro ("Todos"),
  // agrupa por empresa para não misturar folhas de clientes diferentes.
  const porEmpresa: { id: string; nome: string; docs: DocumentWithCompany[] }[] =
    [];
  if (!sp.company) {
    const idx = new Map<string, number>();
    for (const d of docs) {
      const id = d.company?.id ?? d.company_id;
      const nome = d.company ? companyLabel(d.company) : "Cliente";
      let i = idx.get(id);
      if (i === undefined) {
        i = porEmpresa.length;
        idx.set(id, i);
        porEmpresa.push({ id, nome, docs: [] });
      }
      porEmpresa[i].docs.push(d);
    }
    porEmpresa.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  return (
    <>
      <PageHeader
        title="Folha de pagamento"
        subtitle="Folhas mensais publicadas para seus clientes"
      >
        {companyOptions.length >= 2 ? (
          <CompanyFilterSelect
            options={companyOptions}
            value={sp.company ?? ""}
            allLabel="Todas as empresas"
          />
        ) : null}
      </PageHeader>

      <div className="space-y-6 p-6">
        {sp.company ? (
          <FolhaList documents={docs} showDelete />
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhuma folha publicada. Envie a folha de um cliente em “Enviar
            documento”.
          </div>
        ) : (
          porEmpresa.map((g) => (
            <section key={g.id} className="space-y-3">
              <h2 className="text-sm font-semibold">{g.nome}</h2>
              <FolhaList documents={g.docs} showDelete />
            </section>
          ))
        )}
      </div>
    </>
  );
}
