import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tarefa } from "@/components/painel/caixa-tarefas";
import { hojeBR, somarDiasUteis } from "@/lib/dates";
import { diaMesTs, guiaNome } from "@/lib/portal";
import type { DocumentRow } from "@/lib/types";

type DocTarefa = Pick<
  DocumentRow,
  | "id"
  | "company_id"
  | "amount"
  | "categoria"
  | "type"
  | "descricao"
  | "parcela_num"
  | "competencia"
  | "comprovante_at"
  | "comprovante_path"
  | "marcado_pago_at"
> & { plan: { nome: string } | null };

const CAMPOS =
  "id, company_id, amount, categoria, type, descricao, parcela_num, competencia, comprovante_at, comprovante_path, marcado_pago_at, plan:installment_plans(nome)";

/** "Parcela 2 · PARCELAMENTO SIMPLES 05/2026". */
function nomeGuia(d: DocTarefa): string {
  const base = d.categoria === "parcelamento" && d.plan?.nome ? `${guiaNome(d)} · ${d.plan.nome}` : guiaNome(d);
  return d.competencia ? `${base} ${d.competencia}` : base;
}

/**
 * Tarefas do contador ("Para você fazer", tela Clientes): pedidos de 2ª via
 * pendentes e pagamentos informados pelo cliente esperando confirmação.
 * Prazo: 2ª via = 1 dia útil após o pedido; confirmação = 2 dias úteis após o
 * envio. Ordem: prazo (estourado → hoje → futuro) e, no empate, maior valor.
 */
export async function carregarTarefas(
  supabase: SupabaseClient,
  nomeEmpresa: Map<string, string>,
): Promise<Tarefa[]> {
  const hoje = hojeBR();
  const quando = (ts: string) => {
    const dia = diaMesTs(ts);
    return dia === `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}` ? "hoje" : dia;
  };

  const [{ data: pedidosRaw }, { data: aguardandoRaw }] = await Promise.all([
    supabase
      .from("boleto_reissue_requests")
      .select(`id, requested_at, document:documents(${CAMPOS})`)
      .eq("status", "pending"),
    supabase.from("documents").select(CAMPOS).eq("status", "aguardando"),
  ]);

  const tarefas: Tarefa[] = [];
  for (const p of (pedidosRaw ?? []) as unknown as {
    id: string;
    requested_at: string;
    document: DocTarefa | null;
  }[]) {
    const d = p.document;
    if (!d) continue;
    tarefas.push({
      chave: `r-${p.id}`,
      tipo: "2via",
      id: p.id,
      docId: d.id,
      companyId: d.company_id,
      cliente: nomeEmpresa.get(d.company_id) ?? "—",
      meta: `${nomeGuia(d)} · pedida ${quando(p.requested_at)}`,
      valor: d.amount,
      prazo: somarDiasUteis(p.requested_at, 1),
      comprovanteUrl: null,
    });
  }
  for (const d of (aguardandoRaw ?? []) as unknown as DocTarefa[]) {
    const enviadoEm = d.comprovante_at ?? d.marcado_pago_at ?? new Date().toISOString();
    tarefas.push({
      chave: `c-${d.id}`,
      tipo: "confirmar",
      id: d.id,
      docId: d.id,
      companyId: d.company_id,
      cliente: nomeEmpresa.get(d.company_id) ?? "—",
      meta: `${nomeGuia(d)} · ${d.comprovante_at ? "comprovante" : "pagamento informado"} ${quando(enviadoEm)}`,
      valor: d.amount,
      prazo: somarDiasUteis(enviadoEm, 2),
      comprovanteUrl: d.comprovante_path ? `/api/documents/${d.id}/download?tipo=comprovante&view=1` : null,
    });
  }
  tarefas.sort((a, b) => a.prazo.localeCompare(b.prazo) || (b.valor ?? 0) - (a.valor ?? 0));
  return tarefas;
}
