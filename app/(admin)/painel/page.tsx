import { AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, Clock, Users } from "lucide-react";
import { AlertBanner } from "@/components/alert-banner";
import { AssistenteChat } from "@/components/assistente-chat";
import { DocumentsTable } from "@/components/documents-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getUrgency, type Urgency } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentWithCompany } from "@/lib/types";

/** Documento com a forma de pagamento do parcelamento (quando for parcela). */
type PainelDoc = DocumentWithCompany & {
  plan: { forma_pagamento: string } | null;
};

/**
 * Parcela de débito automático que vence a mais de 7 dias. Como o débito gera
 * todas as parcelas de uma vez, escondemos as futuras da lista "em aberto" —
 * elas continuam no detalhe do parcelamento. Só aparecem aqui as vencidas ou a
 * vencer em ≤7 dias (as acionáveis). Mesma regra do portal do cliente.
 */
function ehDebitoAutomaticoFuturo(d: PainelDoc): boolean {
  if (d.categoria !== "parcelamento") return false;
  if (d.plan?.forma_pagamento !== "debito_automatico") return false;
  if (!d.due_date) return false;
  return getUrgency(d.due_date, d.status).urgency === "em_dia";
}

/** Blocos da lista "Próximas obrigações", em ordem de urgência. */
const BUCKETS: {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  urgencies: Urgency[];
}[] = [
  {
    key: "vencido",
    title: "Vencidos",
    icon: AlertTriangle,
    iconClass: "text-red-600 dark:text-red-400",
    urgencies: ["vencido"],
  },
  {
    key: "hoje",
    title: "Vencem hoje",
    icon: Clock,
    iconClass: "text-amber-600 dark:text-amber-400",
    urgencies: ["vence_hoje"],
  },
  {
    key: "semana",
    title: "Próximos 7 dias",
    icon: CalendarClock,
    iconClass: "text-blue-600 dark:text-blue-400",
    urgencies: ["proximos_3", "proximos_7"],
  },
  {
    key: "adiante",
    title: "Mais adiante",
    icon: CheckCircle2,
    iconClass: "text-muted-foreground",
    urgencies: ["em_dia"],
  },
];

export default async function PainelPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: docsRaw }] = await Promise.all([
    supabase.from("companies").select("id").eq("active", true),
    supabase
      .from("documents")
      .select(
        "*, company:companies(id,razao_social,nome_fantasia,email), plan:installment_plans(forma_pagamento)",
      )
      .order("due_date", { ascending: true }),
  ]);

  const docs = (docsRaw ?? []) as PainelDoc[];
  // Boletos e parcelas de parcelamento são "guias a pagar" — entram no resumo.
  const boletos = docs.filter(
    (d) => d.categoria === "boleto" || d.categoria === "parcelamento",
  );
  const open = boletos.filter((d) => d.status === "open");
  // Guias que o cliente marcou como pagas e aguardam a confirmação do contador.
  const aguardando = boletos.filter((d) => d.status === "aguardando");
  const aguardandoValor = aguardando.reduce((s, d) => s + (d.amount ?? 0), 0);
  // Lista "em aberto": oculta as parcelas futuras de débito automático.
  const openList = open.filter((d) => !ehDebitoAutomaticoFuturo(d));

  let vencidosHoje = 0;
  let vencendo = 0;
  let vencidosHojeValor = 0;
  let vencendoValor = 0;
  for (const d of open) {
    if (!d.due_date) continue;
    const { urgency } = getUrgency(d.due_date, d.status);
    if (urgency === "vencido" || urgency === "vence_hoje") {
      vencidosHoje++;
      vencidosHojeValor += d.amount ?? 0;
    } else if (urgency === "proximos_3" || urgency === "proximos_7") {
      vencendo++;
      vencendoValor += d.amount ?? 0;
    }
  }
  const pagosBoletos = boletos.filter((d) => d.status === "paid");
  const pagos = pagosBoletos.length;
  const pagosValor = pagosBoletos.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalClientes = companies?.length ?? 0;

  // Agrupa as obrigações em aberto por urgência — o contador age primeiro no
  // vermelho (vencidos), depois no amarelo, e o que está mais longe fica discreto.
  const urgencyOf = (d: PainelDoc): Urgency =>
    d.due_date ? getUrgency(d.due_date, d.status).urgency : "em_dia";

  const grupos = BUCKETS.map((b) => {
    const items = openList.filter((d) => b.urgencies.includes(urgencyOf(d)));
    return {
      ...b,
      items,
      total: items.reduce((s, d) => s + (d.amount ?? 0), 0),
    };
  }).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral das obrigações dos seus clientes"
      />
      <div className="space-y-6 p-6">
        {vencidosHoje > 0 ? (
          <AlertBanner tone="danger" icon={<AlertTriangle className="size-4" />}>
            <strong>
              {vencidosHoje} boleto{vencidosHoje > 1 ? "s" : ""}
            </strong>{" "}
            vencem hoje ou já venceram. Verifique abaixo e notifique seus
            clientes.
          </AlertBanner>
        ) : null}
        {vencendo > 0 ? (
          <AlertBanner tone="warning" icon={<Clock className="size-4" />}>
            <strong>
              {vencendo} boleto{vencendo > 1 ? "s" : ""}
            </strong>{" "}
            vencem nos próximos 7 dias. Mantenha seus clientes informados.
          </AlertBanner>
        ) : null}

        {aguardando.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">
                Aguardando sua confirmação
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {aguardando.length}
              </span>
              {aguardandoValor > 0 ? (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(aguardandoValor)}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Estes clientes marcaram pagamentos que precisam da sua confirmação.
            </p>
            <DocumentsTable
              documents={aguardando}
              showClient
              showDownload
              showPaid
              isAdmin
              competenciaInline
            />
          </section>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Clientes ativos"
            value={totalClientes}
            sub="empresas"
            tone="info"
            icon={<Users className="size-4" />}
          />
          <MetricCard
            label="Vencidos / hoje"
            value={vencidosHoje}
            sub={`${formatCurrency(vencidosHojeValor)} em atraso`}
            tone="danger"
            icon={<AlertTriangle className="size-4" />}
          />
          <MetricCard
            label="Vencendo em breve"
            value={vencendo}
            sub={`${formatCurrency(vencendoValor)} a vencer`}
            tone="warning"
            icon={<CalendarClock className="size-4" />}
          />
          <MetricCard
            label="Pagos"
            value={pagos}
            sub={`${formatCurrency(pagosValor)} quitados`}
            tone="success"
            icon={<CheckCircle2 className="size-4" />}
          />
        </div>

        <section className="space-y-5">
          <h2 className="text-sm font-semibold">Próximas obrigações</h2>
          {grupos.length === 0 ? (
            <DocumentsTable
              documents={[]}
              emptyMessage="Nenhuma obrigação em aberto. Publique um boleto em “Enviar documento”."
            />
          ) : (
            grupos.map((g) => {
              const Icon = g.icon;
              // "Mais adiante" é o menos urgente: limita para não alongar a tela.
              const items = g.key === "adiante" ? g.items.slice(0, 5) : g.items;
              const ocultos = g.items.length - items.length;
              return (
                <div key={g.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 ${g.iconClass}`} />
                    <span className="text-sm font-medium">{g.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {g.items.length}
                    </span>
                    {g.total > 0 ? (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(g.total)}
                      </span>
                    ) : null}
                  </div>
                  <DocumentsTable
                    documents={items}
                    showClient
                    showDownload
                    showPaid
                    isAdmin
                    competenciaInline
                    subtleActions
                  />
                  {ocultos > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      + {ocultos} obrigaç{ocultos > 1 ? "ões" : "ão"} mais adiante
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </section>
      </div>
      <AssistenteChat scope="contador" />
    </>
  );
}
