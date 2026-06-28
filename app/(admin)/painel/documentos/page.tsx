import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/alert-banner";
import { CollapsibleCard } from "@/components/collapsible-card";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Company, DocumentWithCompany } from "@/lib/types";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "01/2026" -> "Janeiro / 2026"; nulo -> "Sem competência". */
function mesLabel(competencia: string | null): string {
  if (!competencia) return "Sem competência";
  const m = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return competencia;
  return `${MESES_LONGOS[Number(m[1]) - 1] ?? m[1]} / ${m[2]}`;
}

/** Chave ordenável da competência ("01/2026" -> 202601); sem competência por último. */
function compRank(competencia: string | null): number {
  if (!competencia) return -1;
  const m = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return -1;
  return Number(m[2]) * 100 + Number(m[1]);
}

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

  // Com uma empresa filtrada, organiza por mês (competência): a coluna "Cliente"
  // vira redundante (some) e cada competência ganha seu próprio bloco, do mês
  // mais recente para o mais antigo. Sem filtro, mantém a tabela única.
  const filtrado = !!sp.company;
  const grupos: { competencia: string | null; docs: DocumentWithCompany[] }[] =
    [];
  if (filtrado) {
    const idx = new Map<string, number>();
    for (const d of docs) {
      const key = d.competencia ?? "—";
      let i = idx.get(key);
      if (i === undefined) {
        i = grupos.length;
        idx.set(key, i);
        grupos.push({ competencia: d.competencia, docs: [] });
      }
      grupos[i].docs.push(d);
    }
    grupos.sort((a, b) => compRank(b.competencia) - compRank(a.competencia));
  }

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

      <div className="space-y-6 p-6">
        {sp.ok ? (
          <AlertBanner tone="success" icon={<CheckCircle2 className="size-4" />}>
            Documento publicado com sucesso. O cliente já consegue baixá-lo.
          </AlertBanner>
        ) : null}

        {!filtrado ? (
          <DocumentsTable
            documents={docs}
            showClient
            showDownload
            showPaid
            showDelete
            emptyMessage="Nenhum documento. Publique um boleto em “Enviar documento”."
          />
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum documento para este cliente. Publique um boleto em “Enviar
            documento”.
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map((g, i) => (
              <CollapsibleCard
                key={g.competencia ?? "—"}
                titulo={mesLabel(g.competencia)}
                count={g.docs.length}
                defaultOpen={i === 0}
              >
                <DocumentsTable
                  documents={g.docs}
                  showDownload
                  showPaid
                  showDelete
                  hideCompetencia
                  flush
                  emptyMessage="Nenhum documento neste mês."
                />
              </CollapsibleCard>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
