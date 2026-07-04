import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComprovanteButton } from "@/components/comprovante-button";
import { ConfirmPaymentButtons } from "@/components/confirm-payment-buttons";
import { DeleteParcelaButton } from "@/components/delete-parcela-button";
import { EditParcelaButton } from "@/components/edit-parcela-button";
import { PaidToggle } from "@/components/paid-toggle";
import { RequireProofToggle } from "@/components/require-proof-toggle";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Lista as parcelas de um parcelamento (página de detalhe).
 * Cada parcela tem número (N/total), valor, vencimento, status e ações.
 * No débito automático não há boleto para baixar; a ação vira "confirmar
 * pagamento" (se o débito ocorreu naquele mês).
 */
export function ParcelasTable({
  parcelas,
  total,
  showPaid = false,
  debitoAutomatico = false,
  showDelete = false,
  showEdit = false,
  showRequireProof = false,
  enforceProof = false,
  isAdmin = false,
}: {
  parcelas: DocumentRow[];
  total: number;
  showPaid?: boolean;
  /** Débito automático: sem PDF para baixar; toggle = confirmar pagamento. */
  debitoAutomatico?: boolean;
  /** Mostra o botão de excluir parcela individual (só no painel do contador). */
  showDelete?: boolean;
  /** Mostra o botão de editar valor/vencimento (débito automático, painel). */
  showEdit?: boolean;
  /** Mostra o liga/desliga "exigir comprovante" por parcela (painel do contador). */
  showRequireProof?: boolean;
  /** Portal do cliente: aplica a exigência de comprovante no "confirmar pagamento". */
  enforceProof?: boolean;
  /** Painel do contador: parcela aguardando vira Confirmar/Rejeitar; marcar pago
   *  vai direto para confirmado. */
  isAdmin?: boolean;
}) {
  if (parcelas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhuma parcela cadastrada neste parcelamento.
      </div>
    );
  }

  const ordenadas = [...parcelas].sort(
    (a, b) => (a.parcela_num ?? 0) - (b.parcela_num ?? 0),
  );

  // Quantas parcelas seguintes (nº maior) ainda estão em aberto — habilita o
  // "aplicar valor às próximas" na edição.
  const followingOpen = (p: DocumentRow) =>
    ordenadas.filter(
      (x) => (x.parcela_num ?? 0) > (p.parcela_num ?? 0) && x.status === "open",
    ).length;

  // Débito automático não tem boleto: a ação confirma que o débito ocorreu.
  const labelUnpaid = debitoAutomatico ? "Confirmar pagamento" : "Marcar pago";

  // No painel do contador, parcela aguardando vira Confirmar/Rejeitar; senão, o
  // toggle normal (que trava para o cliente quando está aguardando).
  // `compact`: versão curta do estado "aguardando" (o selo de status já aparece
  // ao lado). No cartão mobile, para o cliente, o controle é omitido de vez —
  // o selo no topo do card já informa (ver showPaidControlMobile).
  function paidControl(p: DocumentRow, compact = false) {
    if (isAdmin && p.status === "aguardando") {
      return <ConfirmPaymentButtons docId={p.id} />;
    }
    return (
      <PaidToggle
        docId={p.id}
        paid={p.status === "paid"}
        status={p.status}
        isAdmin={isAdmin}
        compactWaiting={compact}
        labelUnpaid={labelUnpaid}
        requireComprovante={enforceProof && p.exige_comprovante}
        hasComprovante={!!p.comprovante_path}
      />
    );
  }

  const showPaidControlMobile = (p: DocumentRow): boolean =>
    !(p.status === "aguardando" && !isAdmin);

  function downloadButton(doc: DocumentRow) {
    // Parcela de débito automático não tem arquivo — nada para baixar.
    if (!doc.file_path) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={
          <a href={`/api/documents/${doc.id}/download`}>
            <Download />
            Baixar
          </a>
        }
      />
    );
  }

  return (
    <>
      {/* ----- Celular: cartões empilhados ----- */}
      <div className="space-y-2.5 md:hidden">
        {ordenadas.map((p) => (
          <div key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium">
                Parcela {p.parcela_num}/{total}
              </div>
              {p.due_date ? (
                <StatusBadge dueDate={p.due_date} status={p.status} />
              ) : null}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="text-xl font-semibold tabular-nums">
                {p.amount != null ? formatCurrency(p.amount) : "—"}
              </div>
              {p.due_date ? (
                <div className="text-right text-xs leading-tight text-muted-foreground">
                  <div className="tabular-nums">
                    Vence {formatDate(p.due_date)}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {showPaid && showPaidControlMobile(p) ? paidControl(p) : null}
              {showPaid ? (
                <ComprovanteButton
                  docId={p.id}
                  paid={p.status === "paid"}
                  hasComprovante={!!p.comprovante_path}
                  fileName={p.comprovante_name}
                />
              ) : null}
              {showRequireProof && p.status === "open" ? (
                <RequireProofToggle docId={p.id} value={p.exige_comprovante} />
              ) : null}
              {downloadButton(p)}
              {showEdit ? (
                <EditParcelaButton
                  docId={p.id}
                  parcelaNum={p.parcela_num}
                  total={total}
                  amount={p.amount}
                  dueDate={p.due_date}
                  followingOpenCount={followingOpen(p)}
                />
              ) : null}
              {showDelete ? (
                <DeleteParcelaButton
                  docId={p.id}
                  parcelaNum={p.parcela_num}
                  total={total}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* ----- Desktop: tabela ----- */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Parcela</th>
              <th className="px-4 py-2.5 font-medium">Valor</th>
              <th className="px-4 py-2.5 font-medium">Vencimento</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              {showPaid ? (
                <th className="px-4 py-2.5 font-medium">Pagamento</th>
              ) : null}
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((p) => (
              <tr
                key={p.id}
                className={cn("border-b last:border-0 hover:bg-muted/40")}
              >
                <td className="px-4 py-3 font-medium tabular-nums">
                  {p.parcela_num}/{total}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {p.amount != null ? formatCurrency(p.amount) : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {p.due_date ? formatDate(p.due_date) : "—"}
                </td>
                <td className="px-4 py-3">
                  {p.due_date ? (
                    <StatusBadge dueDate={p.due_date} status={p.status} />
                  ) : (
                    "—"
                  )}
                </td>
                {showPaid ? (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {paidControl(p, true)}
                      <ComprovanteButton
                        docId={p.id}
                        paid={p.status === "paid"}
                        hasComprovante={!!p.comprovante_path}
                        fileName={p.comprovante_name}
                      />
                      {showRequireProof && p.status === "open" ? (
                        <RequireProofToggle
                          docId={p.id}
                          value={p.exige_comprovante}
                        />
                      ) : null}
                    </div>
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {downloadButton(p)}
                    {showEdit ? (
                      <EditParcelaButton
                        docId={p.id}
                        parcelaNum={p.parcela_num}
                        total={total}
                        amount={p.amount}
                        dueDate={p.due_date}
                        followingOpenCount={followingOpen(p)}
                      />
                    ) : null}
                    {showDelete ? (
                      <DeleteParcelaButton
                        docId={p.id}
                        parcelaNum={p.parcela_num}
                        total={total}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
