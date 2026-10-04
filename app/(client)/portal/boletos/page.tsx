import { BoletosView, type BoletoLinha } from "@/components/portal/boletos-view";
import { PortalHeader } from "@/components/portal/portal-header";
import { getActiveCompanyId } from "@/lib/companies";
import { competenciaKey, currentCompetenciaKey, getUrgency } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import {
  diaMesTs,
  emDias,
  guiaNome,
  haDias,
  situacaoGuia,
} from "@/lib/portal";
import { serproConfigurado } from "@/lib/serpro/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";

export default async function MeusBoletosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const activeCompanyId = await getActiveCompanyId();
  const companyId = activeCompanyId ?? "00000000-0000-0000-0000-000000000000";
  const [{ data }, { data: reissues }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("categoria", "boleto")
      .eq("company_id", companyId)
      .order("due_date", { ascending: true }),
    // Boletos com pedido de 2ª via pendente (vão para "Com o contador").
    supabase
      .from("boleto_reissue_requests")
      .select("document_id,created_at")
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ]);

  const docs = (data ?? []) as DocumentRow[];
  const reissueEm = new Map<string, string>();
  for (const r of (reissues ?? []) as { document_id: string; created_at: string }[]) {
    reissueEm.set(r.document_id, r.created_at);
  }
  const reissueIds = new Set(reissueEm.keys());

  // DAS vencido: o cliente gera a 2ª via sozinho quando a Receita está integrada.
  const dasAutomatico = serproConfigurado();
  const linhas: BoletoLinha[] = docs.map((d) => {
    const situacao = situacaoGuia(d, reissueIds);
    const pagoEm = d.paid_at ?? d.marcado_pago_at;
    let detalhe = "";
    let nota: string | null = null;
    if (situacao === "pago") {
      detalhe = pagoEm ? diaMesTs(pagoEm) : "";
    } else if (situacao === "contador") {
      const pedida = reissueEm.get(d.id);
      if (d.status === "aguardando") {
        nota = d.comprovante_at
          ? `comprovante enviado ${diaMesTs(d.comprovante_at)}`
          : "pagamento informado";
      } else {
        nota = pedida ? `2ª via pedida ${diaMesTs(pedida)}` : "2ª via pedida";
      }
    } else if (d.due_date) {
      const { days } = getUrgency(d.due_date, d.status);
      const dia = formatDayMonth(d.due_date);
      detalhe =
        situacao === "precisa"
          ? `${dia}, ${haDias(days)}`
          : days === 0
            ? "vence hoje"
            : `${dia}, ${emDias(days)}`;
    }
    return {
      id: d.id,
      nome: guiaNome(d),
      competencia: d.competencia,
      valor: d.amount,
      situacao,
      detalhe,
      nota,
      exigeComprovante: d.exige_comprovante,
      temArquivo: !!d.file_path,
      temComprovante: !!d.comprovante_path,
      comprovanteNome: d.comprovante_name,
      vencKey: d.due_date ? d.due_date.slice(0, 7) : null,
      pagoKey: (pagoEm ?? d.due_date)?.slice(0, 7) ?? null,
      compKey: d.competencia ? competenciaKey(d.competencia) : null,
      dueDate: d.due_date,
      pagoEm: pagoEm ?? null,
      gerarAuto: dasAutomatico && d.type === "das",
    };
  });

  const abaInicial =
    tab === "pagos" || tab === "todos" ? tab : ("aberto" as const);

  return (
    <>
      <PortalHeader title="Meus boletos" tela="boletos" />
      <div className="px-4 pt-5 pb-10 sm:px-6">
        <BoletosView
          linhas={linhas}
          abaInicial={abaInicial}
          mesAtual={currentCompetenciaKey()}
        />
      </div>
    </>
  );
}
