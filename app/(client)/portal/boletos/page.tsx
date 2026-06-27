import { BoletosPagos } from "@/components/boletos-pagos";
import { DocumentsTable } from "@/components/documents-table";
import { PageHeader } from "@/components/page-header";
import { getActiveCompanyId } from "@/lib/companies";
import { formatCurrency } from "@/lib/format";
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
    .order("due_date", { ascending: true });

  const docs = (data ?? []) as DocumentWithCompany[];

  // Em aberto fica em destaque (mais urgente primeiro); pagos viram histórico.
  const abertos = docs.filter((d) => d.status === "open");
  const pagos = docs.filter((d) => d.status === "paid");
  const totalAberto = abertos.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalPago = pagos.reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Meus boletos"
        subtitle="Baixe seus boletos e marque o que já foi pago"
      />
      <div className="space-y-6 p-6">
        <section className="space-y-3">
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
          <DocumentsTable
            documents={abertos}
            showPreview
            showDownload
            showPaid
            emptyMessage="Tudo em dia! Você não tem boletos em aberto."
          />
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
