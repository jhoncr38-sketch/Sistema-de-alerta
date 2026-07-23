import { PageHeader } from "@/components/page-header";
import { RelatorioControls } from "@/components/relatorio-controls";
import { RelatorioSheet } from "@/components/relatorio-sheet";
import { getBranding } from "@/lib/branding";
import { currentCompetenciaKey } from "@/lib/dates";
import type { RevenueInput } from "@/lib/faturamento";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import {
  montarRelatorio,
  nextMonthKey,
  prevMonthKey,
  type RelatorioDoc,
} from "@/lib/relatorio";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { enviarRelatorioCliente } from "./actions";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pct(v: number): string {
  return `${Math.abs(v).toFixed(1).replace(".", ",")}%`;
}
function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

/**
 * Relatório mensal ("prestação de contas") — SÓ no painel do contador. Ele
 * escolhe a empresa e o mês, salva em PDF (impressão) e decide quando enviar ao
 * cliente por e-mail. `?empresa=<id>&mes=YYYY-MM` (padrão: 1º cliente, mês anterior).
 */
export default async function PainelRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; mes?: string }>;
}) {
  const [supabase, branding, sp] = await Promise.all([
    createClient(),
    getBranding(),
    searchParams,
  ]);

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("*")
    .order("razao_social");
  const companies = (companiesRaw ?? []) as Company[];

  if (companies.length === 0) {
    return (
      <>
        <PageHeader
          title="Relatório do mês"
          subtitle="Prestação de contas para enviar ao cliente"
        />
        <div className="p-6">
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Cadastre uma empresa em Clientes para gerar o relatório.
          </div>
        </div>
      </>
    );
  }

  const selectedId =
    (sp.empresa && companies.find((c) => c.id === sp.empresa)?.id) ||
    companies[0].id;
  const company = companies.find((c) => c.id === selectedId) as Company;

  const currentKey = currentCompetenciaKey();
  const mesParam =
    typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  let competencia = mesParam ?? prevMonthKey(currentKey);
  if (competencia > currentKey) competencia = currentKey;
  const [cy, cm] = competencia.split("-").map(Number);

  const [{ data: docsRaw }, { data: revenuesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
      )
      .eq("company_id", selectedId),
    supabase
      .from("revenues")
      .select("competencia, amount")
      .eq("company_id", selectedId),
  ]);

  const companyName = company.nome_fantasia || company.razao_social;
  const model = montarRelatorio(
    (docsRaw ?? []) as RelatorioDoc[],
    (revenuesRaw ?? []) as RevenueInput[],
    competencia,
    companyName,
  );

  const mesLower = model.mesLabel.toLowerCase();
  const emAtraso = model.emAtraso;

  // Barras da evolução (altura proporcional ao maior faturamento das duas).
  const evolucao =
    model.faturamentoMes > 0 &&
    model.fatAnterior != null &&
    model.mesAnteriorLabel &&
    model.crescimento != null
      ? (() => {
          const maxFat = Math.max(model.faturamentoMes, model.fatAnterior ?? 0) || 1;
          return {
            mesAnteriorLabel: model.mesAnteriorLabel,
            fatAnteriorLabel: formatCurrency(model.fatAnterior ?? 0),
            anteriorH: Math.max(12, Math.round((120 * (model.fatAnterior ?? 0)) / maxFat)),
            mesAtualLabel: model.mesLabel,
            fatAtualLabel: formatCurrency(model.faturamentoMes),
            atualH: Math.max(12, Math.round((120 * model.faturamentoMes) / maxFat)),
            crescimentoLabel: `${model.crescimento >= 0 ? "+" : "−"}${pct(model.crescimento)}`,
            crescimentoTone: (model.crescimento >= 0 ? "up" : "down") as "up" | "down",
          };
        })()
      : null;

  const nextYm = nextMonthKey(competencia);

  return (
    <>
      <PageHeader
        title="Relatório do mês"
        subtitle="Prestação de contas para enviar ao cliente"
      />
      <div className="p-6">
        <RelatorioControls
          companies={companies.map((c) => ({
            id: c.id,
            label: c.nome_fantasia || c.razao_social,
          }))}
          selectedId={selectedId}
          competencia={competencia}
          badge={`${model.mesLabel} · ${model.ano}`}
          prevYm={prevMonthKey(competencia)}
          nextYm={nextYm <= currentKey ? nextYm : null}
          clienteNome={companyName}
          sendAction={enviarRelatorioCliente.bind(null, selectedId, competencia)}
        />

        <RelatorioSheet
          brandName={branding.name}
          logoUrl={branding.logoUrl}
          periodo={`${model.mesLabel} · ${model.ano}`}
          competenciaCurto={`Competência ${pad2(cm)}/${cy}`}
          cliente={companyName}
          cnpj={company.cnpj ?? null}
          alerta={
            emAtraso > 0
              ? {
                  tone: "atencao",
                  texto: `${emAtraso} ${plural(emAtraso, "guia vencida", "guias vencidas")} a regularizar`,
                }
              : { tone: "ok", texto: "Tudo em dia" }
          }
          totalPagoLabel={formatCurrency(model.pagosValor)}
          guiasPagasLabel={
            model.pagos > 0
              ? `${model.pagos} ${plural(model.pagos, "guia quitada", "guias quitadas")} em ${mesLower}`
              : `Nenhuma guia quitada em ${mesLower}`
          }
          proximos={model.proximos.slice(0, 6).map((p) => ({
            id: p.id,
            tipo: p.tipo,
            whenLabel: formatDayMonth(p.dueDate),
            amountLabel: formatCurrency(p.amount ?? 0),
          }))}
          proximosMesLabel={model.proximosMesLabel}
          totalAVencerLabel={
            model.proximos.length > 0 ? formatCurrency(model.proximosTotal) : null
          }
          faturamentoLabel={
            model.faturamentoMes > 0 ? formatCurrency(model.faturamentoMes) : null
          }
          faturamentoVar={
            model.crescimento != null
              ? {
                  txt: `${model.crescimento >= 0 ? "▲" : "▼"} ${pct(model.crescimento)}`,
                  tone: model.crescimento >= 0 ? "up" : "down",
                }
              : null
          }
          cargaLabel={model.cargaMes != null ? pct(model.cargaMes) : null}
          situacao={
            emAtraso > 0
              ? { valor: `${emAtraso} ${plural(emAtraso, "vencida", "vencidas")}`, tone: "alerta" }
              : { valor: "Em dia", tone: "ok" }
          }
          evolucao={evolucao}
          resumoTexto={model.resumoTexto}
        />
      </div>
    </>
  );
}
