import { FolhaList } from "@/components/folha-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Company, DocumentWithCompany } from "@/lib/types";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("*")
    .order("razao_social");
  const companies = (companiesRaw ?? []) as Company[];

  let query = supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "folha")
    .order("competencia_month", { ascending: false, nullsFirst: false });
  if (sp.company) query = query.eq("company_id", sp.company);
  const { data: docsRaw } = await query;
  const docs = (docsRaw ?? []) as DocumentWithCompany[];

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
        <form method="get" className="flex items-center gap-2">
          <select
            name="company"
            defaultValue={sp.company ?? ""}
            className={selectClass}
          >
            <option value="">Todos os clientes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyLabel(c)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filtrar
          </Button>
        </form>
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
