import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import { MapaAno, type EstadoMes } from "@/components/portal/mapa-ano";
import { PortalHeader } from "@/components/portal/portal-header";
import { GradeGuias, type GuiaQuadro } from "@/components/portal/quadro-guias";
import { getClientCompanyContext } from "@/lib/companies";
import { currentCompetenciaKey } from "@/lib/dates";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import {
  ehDebitoAutomaticoFuturo,
  guiaMeta,
  guiaNome,
  situacaoGuia,
  type Situacao,
} from "@/lib/portal";
import { serproConfigurado } from "@/lib/serpro/auth";
import { createClient } from "@/lib/supabase/server";
import type { Aviso, DocumentRow } from "@/lib/types";

/** Guia a pagar com os dados do parcelamento (quando for parcela). */
type PortalDoc = DocumentRow & {
  plan: { forma_pagamento: string; nome: string } | null;
};

/** "Sábado, 3 de outubro" no fuso do Brasil. */
function hojeExtenso(): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Ordem dos cartões: o mais urgente primeiro. */
const ORDEM: Record<Exclude<Situacao, "pago">, number> = {
  precisa: 0,
  a_pagar: 1,
  contador: 2,
};

export default async function PortalHome() {
  const supabase = await createClient();
  const { active } = await getClientCompanyContext();
  const activeId = active?.id ?? "00000000-0000-0000-0000-000000000000";
  const [{ data }, { data: reissues }, { data: avisosData }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*, plan:installment_plans(forma_pagamento,nome)")
        .eq("company_id", activeId)
        .in("categoria", ["boleto", "parcelamento"])
        .order("due_date", { ascending: true }),
      supabase
        .from("boleto_reissue_requests")
        .select("document_id,created_at")
        .eq("company_id", activeId)
        .eq("status", "pending"),
      // Avisos da empresa ativa + os globais (company_id nulo).
      supabase
        .from("avisos")
        .select("*")
        .or(`company_id.eq.${activeId},company_id.is.null`)
        .order("created_at", { ascending: false }),
    ]);

  const docs = (data ?? []) as PortalDoc[];
  const avisos = (avisosData ?? []) as Aviso[];
  const reissueEm = new Map<string, string>();
  for (const r of (reissues ?? []) as { document_id: string; created_at: string }[]) {
    reissueEm.set(r.document_id, r.created_at);
  }
  const reissueIds = new Set(reissueEm.keys());

  // DAS vencido: o cliente gera a 2ª via sozinho quando a Receita está integrada.
  const dasAutomatico = serproConfigurado();
  const mesAtual = currentCompetenciaKey();
  const ano = mesAtual.slice(0, 4);
  const situacoes = new Map<string, Situacao>();
  const guias: (GuiaQuadro & { due: string })[] = [];
  let emAberto = 0;
  let pagosAno = 0;
  let pagosAnoValor = 0;

  for (const d of docs) {
    const situacao = situacaoGuia(d, reissueIds);
    situacoes.set(d.id, situacao);
    if (situacao === "pago") {
      const quando = d.paid_at ?? d.marcado_pago_at ?? d.due_date;
      if (quando?.startsWith(ano)) {
        pagosAno++;
        pagosAnoValor += d.amount ?? 0;
      }
      continue;
    }
    // Parcelas futuras de débito automático não pedem nada ao cliente.
    if (ehDebitoAutomaticoFuturo(d, d.plan?.forma_pagamento)) continue;
    emAberto += d.amount ?? 0;

    const debito = d.plan?.forma_pagamento === "debito_automatico";
    guias.push({
      id: d.id,
      situacao,
      nome:
        d.categoria === "parcelamento" && d.plan?.nome
          ? `${guiaNome(d)} · ${d.plan.nome}`
          : guiaNome(d),
      valor: d.amount,
      meta:
        debito && situacao === "a_pagar" && d.due_date
          ? `Débito automático · ${formatDayMonth(d.due_date)}`
          : guiaMeta(d, situacao, reissueEm.get(d.id)),
      exigeComprovante: d.exige_comprovante,
      temArquivo: !!d.file_path,
      debitoAutomatico: debito,
      gerarAuto: dasAutomatico && d.categoria === "boleto" && d.type === "das",
      due: d.due_date ?? "9999-12-31",
    });
  }
  // Atrasado → a pagar → com o contador; dentro de cada um, por vencimento.
  guias.sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.due.localeCompare(b.due));

  // Mapa do ano (por vencimento): mês com atraso fica vermelho, tudo pago verde.
  const estados: EstadoMes[] = Array.from({ length: 12 }, (_, i) => {
    const key = `${ano}-${String(i + 1).padStart(2, "0")}`;
    if (key > mesAtual) return "vazio";
    const doMes = docs.filter((d) => d.due_date?.startsWith(key));
    if (doMes.some((d) => situacoes.get(d.id) === "precisa")) return "pendente";
    if (key === mesAtual) return "corrente";
    if (doMes.length > 0 && doMes.every((d) => situacoes.get(d.id) === "pago")) return "pago";
    return doMes.length > 0 ? "corrente" : "vazio";
  });

  const companyName = active?.nome_fantasia || active?.razao_social || "";

  return (
    <>
      <PortalHeader
        title={companyName ? `Olá, ${companyName}!` : "Olá!"}
        subtitle={hojeExtenso()}
        tela="boletos"
        empresaSobTitulo
      />
      <div className="flex flex-col gap-4 px-4 pt-5 pb-10 sm:gap-5 sm:px-8 sm:py-7">
        {avisos.length > 0 ? (
          <section className="space-y-2">
            {avisos.map((a) => (
              <div
                key={a.id}
                className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
              >
                <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">
                    {a.message}
                  </p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <div className="flex items-baseline justify-between gap-3 sm:justify-start">
          <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">Suas guias</h2>
          <span className="text-[13px] text-muted-foreground sm:text-sm">
            Em aberto<span className="hidden sm:inline">:</span>{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {formatCurrency(emAberto)}
            </strong>
          </span>
        </div>

        <MapaAno
          rotulo={`Pago em ${ano}`}
          valor={formatCurrency(pagosAnoValor)}
          estados={estados}
          acao={
            <Link
              href="/portal/boletos?tab=pagos"
              className="inline-flex items-center gap-0.5 text-[13px] font-medium whitespace-nowrap text-primary hover:underline"
            >
              {pagosAno} {pagosAno === 1 ? "pago" : "pagos"}
              <ChevronRight className="size-3.5" />
            </Link>
          }
        />

        <GradeGuias guias={guias} />
      </div>
    </>
  );
}
