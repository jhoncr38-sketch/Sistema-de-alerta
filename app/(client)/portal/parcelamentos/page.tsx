import { PortalHeader } from "@/components/portal/portal-header";
import {
  ListaPlanosCelular,
  PlanoDetalhe,
  SeletorPlanos,
  type PlanoResumo,
} from "@/components/portal/parcelamentos-view";
import { getActiveCompanyId } from "@/lib/companies";
import { modalidadeLabel } from "@/lib/constants";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import { lerPlano, type LeituraPlano } from "@/lib/parcelamento-portal";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow, InstallmentPlan } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlanoComParcelas = InstallmentPlan & { parcelas: DocumentRow[] };

/** Mini-cartão: texto e cor da situação do plano. */
function situacaoDoPlano(
  plano: PlanoComParcelas,
  l: LeituraPlano,
): Pick<PlanoResumo, "situacao" | "situacaoCelular" | "tom"> {
  const debito = plano.forma_pagamento === "debito_automatico";
  if (l.atrasadas > 0 && l.primeiraAtrasada) {
    const n = l.primeiraAtrasada.parcela_num;
    const texto =
      l.atrasadas === 1 ? `Parcela ${n} atrasada` : `${l.atrasadas} parcelas atrasadas`;
    const data = l.primeiraAtrasada.due_date
      ? ` · ${formatDayMonth(l.primeiraAtrasada.due_date)}`
      : "";
    return { situacao: texto, situacaoCelular: texto + data, tom: "red" };
  }
  if (l.pagas >= l.total && l.total > 0) {
    const t = l.quitadoEm ? `Quitado em ${l.quitadoEm}` : "Quitado";
    return { situacao: t, situacaoCelular: t, tom: "green" };
  }
  if (l.proxima?.due_date) {
    const dia = formatDayMonth(l.proxima.due_date);
    if (debito) {
      return {
        situacao: `Débito automático · ${dia}`,
        situacaoCelular: `Parcela ${l.proxima.parcela_num} · débito em ${dia}`,
        tom: "muted",
      };
    }
    return {
      situacao: `Parcela ${l.proxima.parcela_num} · vence ${dia}`,
      situacaoCelular: `Parcela ${l.proxima.parcela_num} · vence ${dia}`,
      tom: "primary",
    };
  }
  return { situacao: "Em dia", situacaoCelular: "Em dia", tom: "muted" };
}

export default async function PortalParcelamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>;
}) {
  const { plano: planoParam } = await searchParams;
  const supabase = await createClient();
  const companyId =
    (await getActiveCompanyId()) ?? "00000000-0000-0000-0000-000000000000";

  const [{ data }, { data: reissues }] = await Promise.all([
    supabase
      .from("installment_plans")
      .select("*, parcelas:documents(*)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("boleto_reissue_requests")
      .select("document_id,created_at")
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ]);

  const planos = (data ?? []) as unknown as PlanoComParcelas[];
  const reissue = new Map<string, string>();
  for (const r of (reissues ?? []) as { document_id: string; created_at: string }[]) {
    reissue.set(r.document_id, r.created_at);
  }

  const leituras = new Map<string, LeituraPlano>();
  for (const p of planos) {
    leituras.set(
      p.id,
      lerPlano(p.total, p.parcelas ?? [], reissue, p.forma_pagamento === "debito_automatico"),
    );
  }

  // Plano padrão: o que tem a parcela mais urgente (atrasada ou a próxima).
  const porUrgencia = [...planos]
    .filter((p) => leituras.get(p.id)?.urgencia)
    .sort((a, b) => {
      const la = leituras.get(a.id)!;
      const lb = leituras.get(b.id)!;
      if (la.atrasadas > 0 !== lb.atrasadas > 0) return la.atrasadas > 0 ? -1 : 1;
      return la.urgencia! < lb.urgencia! ? -1 : 1;
    });
  const explicito = planos.find((p) => p.id === planoParam) ?? null;
  const selecionado = explicito ?? porUrgencia[0] ?? planos[0] ?? null;

  const resumos: PlanoResumo[] = planos.map((p) => {
    const l = leituras.get(p.id)!;
    return {
      id: p.id,
      nome: p.nome,
      href: `/portal/parcelamentos?plano=${p.id}`,
      pagas: l.pagas,
      total: l.total,
      pct: l.pct,
      atrasado: l.atrasadas > 0,
      atrasadaId: l.primeiraAtrasada?.id ?? null,
      ...situacaoDoPlano(p, l),
    };
  });
  const saldoTotal = planos.reduce((s, p) => s + (leituras.get(p.id)?.saldo ?? 0), 0);

  const forma = (p: PlanoComParcelas) =>
    p.forma_pagamento === "debito_automatico" ? "Débito automático" : "Boleto mensal";

  return (
    <>
      <PortalHeader title="Parcelamentos" tela="parcelamentos">
        {planos.length > 0 ? (
          <span className="text-xs text-muted-foreground md:hidden">
            Saldo {formatCurrency(saldoTotal)}
          </span>
        ) : null}
      </PortalHeader>
      <div className="px-4 pt-5 pb-10 sm:px-6">
        {planos.length === 0 || !selecionado ? (
          <div className="rounded-[10px] border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Você não tem parcelamentos no momento.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Celular: tela 1 = lista (sem ?plano); tela 2 = detalhe. */}
            <div className={cn("md:hidden", explicito && "hidden")}>
              <ListaPlanosCelular planos={resumos} />
            </div>

            <div className="hidden md:block">
              <SeletorPlanos planos={resumos} selecionadoId={selecionado.id} />
            </div>

            <div className={cn(!explicito && "hidden md:block")}>
              <PlanoDetalhe
                key={selecionado.id}
                nome={selecionado.nome}
                subtitulo={`${modalidadeLabel(selecionado.modalidade)} · ${forma(selecionado)} · ${selecionado.total} parcelas`}
                subtituloCelular={`${modalidadeLabel(selecionado.modalidade)} · ${forma(selecionado) === "Boleto mensal" ? "Boleto" : "Débito automático"}`}
                leitura={leituras.get(selecionado.id)!}
                parcelas={selecionado.parcelas ?? []}
                debitoAutomatico={selecionado.forma_pagamento === "debito_automatico"}
                voltarHref="/portal/parcelamentos"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
