import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComprovanteButton } from "@/components/comprovante-button";
import { PaidToggle } from "@/components/paid-toggle";
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
}: {
  parcelas: DocumentRow[];
  total: number;
  showPaid?: boolean;
  /** Débito automático: sem PDF para baixar; toggle = confirmar pagamento. */
  debitoAutomatico?: boolean;
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

  // Débito automático não tem boleto: a ação confirma que o débito ocorreu.
  const labelUnpaid = debitoAutomatico ? "Confirmar pagamento" : "Marcar pago";

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
              {showPaid ? (
                <PaidToggle
                  docId={p.id}
                  paid={p.status === "paid"}
                  labelUnpaid={labelUnpaid}
                />
              ) : null}
              {showPaid ? (
                <ComprovanteButton
                  docId={p.id}
                  paid={p.status === "paid"}
                  hasComprovante={!!p.comprovante_path}
                  fileName={p.comprovante_name}
                />
              ) : null}
              {downloadButton(p)}
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
                      <PaidToggle
                        docId={p.id}
                        paid={p.status === "paid"}
                        labelUnpaid={labelUnpaid}
                      />
                      <ComprovanteButton
                        docId={p.id}
                        paid={p.status === "paid"}
                        hasComprovante={!!p.comprovante_path}
                        fileName={p.comprovante_name}
                      />
                    </div>
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {downloadButton(p)}
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
