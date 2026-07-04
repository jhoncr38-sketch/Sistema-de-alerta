import { BoletosPagos } from "@/components/boletos-pagos";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { getActiveCompanyId } from "@/lib/companies";
import { parseCompetencia } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

/** Mês de referência do boleto (competência ou, na falta, mês do vencimento). */
function mesGrupo(d: DocumentWithCompany): { key: string; label: string } {
  let base = parseCompetencia(d.competencia);
  if (!base && d.due_date) {
    const [y, m] = d.due_date.split("T")[0].split("-").map(Number);
    base = new Date(y, (m ?? 1) - 1, 1);
  }
  if (!base) return { key: "zzzz-99", label: "Sem data" };
  const key = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  const nome = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(base);
  return { key, label: nome.charAt(0).toUpperCase() + nome.slice(1) };
}

export default async function MeusBoletosPage() {
  const supabase = await createClient();
  const activeCompanyId = await getActiveCompanyId();
  const { data } = await supabase
    .from("documents")
    .select("*, company:companies(id,razao_social,nome_fantasia,email)")
    .eq("categoria", "boleto")
    .eq("company_id", activeCompanyId ?? "00000000-0000-0000-0000-000000000000")
    .order("due_date", { ascending: true });

  const docs = (data ?? []) as DocumentWithCompany[];

  // Em aberto fica em destaque (mais urgente primeiro); pagos viram histórico.
  // 'aguardando' (pagamento declarado, à espera do contador) continua entre os
  // "em aberto" — o cliente vê o selo "Aguardando confirmação" e não some da tela.
  const abertos = docs.filter((d) => d.status !== "paid");
  const pagos = docs.filter((d) => d.status === "paid");
  const totalAberto = abertos.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalPago = pagos.reduce((s, d) => s + (d.amount ?? 0), 0);

  // Agrupa os boletos em aberto por mês (a lista já vem do mais urgente ao menos).
  const grupos: { key: string; label: string; docs: DocumentWithCompany[] }[] =
    [];
  const idxPorMes = new Map<string, number>();
  for (const d of abertos) {
    const g = mesGrupo(d);
    let i = idxPorMes.get(g.key);
    if (i === undefined) {
      i = grupos.length;
      idxPorMes.set(g.key, i);
      grupos.push({ key: g.key, label: g.label, docs: [] });
    }
    grupos[i].docs.push(d);
  }

  return (
    <>
      <PageHeader
        title="Meus boletos"
        subtitle="Baixe seus boletos e marque o que já foi pago"
      />
      <div className="space-y-6 p-6">
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Em aberto</h2>
            {abertos.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                A pagar:{" "}
                <strong className="text-foreground tabular-nums">
                  {formatCurrency(totalAberto)}
                </strong>{" "}
                · {abertos.length} {abertos.length === 1 ? "boleto" : "boletos"}
              </span>
            ) : null}
          </div>
          {abertos.length === 0 ? (
            <DocumentsTable
              documents={[]}
              emptyMessage="Tudo em dia! Você não tem boletos em aberto."
            />
          ) : (
            grupos.map((g) => (
              <div key={g.key} className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.label}
                </h3>
                <DocumentsTable
                  documents={g.docs}
                  showPreview
                  showDownload
                  showPaid
                  enforceProof
                  showTypeIcon
                  hideCompetencia
                />
              </div>
            ))
          )}
        </section>

        {pagos.length > 0 ? (
          <BoletosPagos
            documents={pagos}
            total={totalPago}
            defaultOpen={abertos.length === 0}
          />
        ) : null}
      </div>
    </>
  );
}
