import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/alert-banner";
import { CollapsibleCard } from "@/components/collapsible-card";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { getUrgency } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
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

/** Documento com a forma de pagamento do parcelamento (quando for parcela). */
type DocComPlano = DocumentWithCompany & {
  plan: { forma_pagamento: string } | null;
};

/** "Guias a pagar" — têm valor/vencimento e status (open/aguardando/paid). */
function isPagavel(d: DocComPlano): boolean {
  return d.categoria === "boleto" || d.categoria === "parcelamento";
}

/**
 * Parcela de débito automático que ainda está em dia (nem vencida nem vencendo).
 * Como o débito gera todas as parcelas de uma vez, as futuras são ruído na lista
 * "em aberto" — o cliente nem paga por boleto. Mesma regra do dashboard.
 */
function ehDebitoAutomaticoFuturo(d: DocComPlano): boolean {
  if (d.categoria !== "parcelamento") return false;
  if (d.plan?.forma_pagamento !== "debito_automatico") return false;
  if (!d.due_date) return false;
  return getUrgency(d.due_date, d.status).urgency === "em_dia";
}

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

type StatusFiltro = "aberto" | "pago" | "todos";

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; ok?: string; status?: string }>;
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
    .select(
      "*, company:companies(id,razao_social,nome_fantasia,email), plan:installment_plans(forma_pagamento)",
    )
    .order("due_date", { ascending: true });
  if (sp.company) query = query.eq("company_id", sp.company);
  const { data: docsRaw } = await query;
  const docs = (docsRaw ?? []) as DocComPlano[];

  const filtrado = !!sp.company;

  // Filtro de status. "Em aberto" mostra só o ACIONÁVEL — guias a pagar não pagas,
  // sem as parcelas futuras de débito automático (ruído; o dashboard também as
  // esconde) e sem informativos (folha/documentos, que não têm status de pagamento).
  // "Pagos" = guias a pagar quitadas. "Todos" = tudo, incluindo informativos e o
  // cronograma completo de parcelas. Padrão: em aberto.
  const statusFiltro: StatusFiltro =
    sp.status === "pago" || sp.status === "todos" ? sp.status : "aberto";
  const emAberto = docs.filter(
    (d) =>
      isPagavel(d) && d.status !== "paid" && !ehDebitoAutomaticoFuturo(d),
  );
  const pagos = docs.filter((d) => isPagavel(d) && d.status === "paid");
  const visiveis =
    statusFiltro === "todos" ? docs : statusFiltro === "pago" ? pagos : emAberto;

  // Agrupa por competência (mês) sempre — o mês mais recente aberto, o resto
  // recolhido. Sem empresa filtrada, a coluna Cliente aparece dentro de cada mês.
  const grupos: { competencia: string | null; docs: DocComPlano[] }[] = [];
  const idx = new Map<string, number>();
  for (const d of visiveis) {
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

  const statusOpts: { key: StatusFiltro; label: string; count: number }[] = [
    { key: "aberto", label: "Em aberto", count: emAberto.length },
    { key: "pago", label: "Pagos", count: pagos.length },
    { key: "todos", label: "Todos", count: docs.length },
  ];
  const hrefStatus = (s: StatusFiltro): string => {
    const params = new URLSearchParams();
    if (sp.company) params.set("company", sp.company);
    params.set("status", s);
    return `?${params.toString()}`;
  };

  return (
    <>
      <PageHeader title="Documentos" subtitle="Todos os boletos publicados">
        <form method="get" className="flex items-center gap-2">
          {/* Preserva o filtro de status ao trocar a empresa. */}
          <input type="hidden" name="status" value={statusFiltro} />
          <select
            name="company"
            defaultValue={sp.company ?? ""}
            className={selectClass}
          >
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

        {/* Filtro de status: "Em aberto" (padrão) mostra só o que precisa de ação. */}
        <div className="flex flex-wrap items-center gap-2">
          {statusOpts.map((o) => {
            const ativo = o.key === statusFiltro;
            return (
              <Link
                key={o.key}
                href={hrefStatus(o.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
                <span className="tabular-nums opacity-80">{o.count}</span>
              </Link>
            );
          })}
        </div>

        {grupos.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            {statusFiltro === "pago"
              ? "Nenhuma guia paga ainda."
              : statusFiltro === "aberto"
                ? "Nenhuma guia em aberto. 🎉"
                : "Nenhum documento. Publique um boleto em “Enviar documento”."}
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
                  showClient={!filtrado}
                  showDownload
                  showPaid
                  isAdmin
                  showDelete
                  showRequireProof
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
