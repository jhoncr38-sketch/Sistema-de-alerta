import { Download, FileText } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FilePreviewButton } from "@/components/file-preview-button";
import { Button } from "@/components/ui/button";
import { PaidToggle } from "@/components/paid-toggle";
import { StatusBadge } from "@/components/status-badge";
import { docTypeLabel } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DocumentsTable({
  documents,
  showClient = false,
  showDownload = false,
  showPreview = false,
  showPaid = false,
  showDelete = false,
  emptyMessage = "Nenhum boleto encontrado.",
}: {
  documents: DocumentWithCompany[];
  showClient?: boolean;
  showDownload?: boolean;
  /** Botão "Visualizar": abre o arquivo num preview dentro da página (modal). */
  showPreview?: boolean;
  showPaid?: boolean;
  /** Só nas telas do contador: botão de apagar o documento do sistema. */
  showDelete?: boolean;
  emptyMessage?: string;
}) {
  const showActions = showDownload || showPreview || showDelete;

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  // Esconde automaticamente as colunas que não se aplicam à lista atual:
  // folha e documentos não têm valor/vencimento; documentos da empresa também
  // não têm competência; e só boletos têm status (vencido/pago).
  const hasCompetencia = documents.some((d) => !!d.competencia);
  const hasAmount = documents.some((d) => d.amount != null);
  const hasDueDate = documents.some((d) => d.due_date != null);
  const hasBoleto = documents.some((d) => d.categoria === "boleto");
  const showPaidCol = showPaid && hasBoleto;

  // Selo de status (boleto com vencimento) ou "Informativo" — usado nos dois layouts.
  function statusBadge(doc: DocumentWithCompany) {
    if (doc.categoria === "boleto" && doc.due_date) {
      return <StatusBadge dueDate={doc.due_date} status={doc.status} />;
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
        <FileText className="size-3" />
        Informativo
      </span>
    );
  }

  function previewButton(doc: DocumentWithCompany) {
    const nome =
      docTypeLabel(doc.type) + (doc.competencia ? ` · ${doc.competencia}` : "");
    return <FilePreviewButton docId={doc.id} fileName={nome} />;
  }

  function downloadButton(doc: DocumentWithCompany) {
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

  function deleteButton(doc: DocumentWithCompany) {
    return (
      <ConfirmDeleteButton
        action={deleteDocument.bind(null, doc.id)}
        title="Apagar documento?"
        confirmLabel="Apagar documento"
        successMessage="Documento apagado."
        description={
          <>
            O documento{" "}
            <strong>
              {docTypeLabel(doc.type)}
              {doc.competencia ? ` · ${doc.competencia}` : ""}
            </strong>
            {doc.company
              ? ` de ${doc.company.nome_fantasia || doc.company.razao_social}`
              : ""}{" "}
            será removido do sistema junto com o arquivo. Esta ação não pode ser
            desfeita.
          </>
        }
      />
    );
  }

  return (
    <>
      {/* ----- Celular: cartões empilhados (a tabela não cabe na largura) ----- */}
      <div className="space-y-2.5 md:hidden">
        {documents.map((doc) => {
          const isBoleto = doc.categoria === "boleto";
          const hasActions = (showPaid && isBoleto) || showActions;
          return (
            <div key={doc.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {showClient ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {doc.company?.nome_fantasia ||
                        doc.company?.razao_social ||
                        "—"}
                    </div>
                  ) : null}
                  <div className="font-medium leading-snug">
                    {docTypeLabel(doc.type)}
                  </div>
                </div>
                {hasBoleto ? (
                  <div className="shrink-0">{statusBadge(doc)}</div>
                ) : null}
              </div>

              {doc.amount != null || doc.competencia || doc.due_date ? (
                <div className="flex items-end justify-between gap-3">
                  {doc.amount != null ? (
                    <div className="text-xl font-semibold tabular-nums">
                      {formatCurrency(doc.amount)}
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="text-right text-xs leading-tight text-muted-foreground">
                    {doc.competencia ? (
                      <div>Competência {doc.competencia}</div>
                    ) : null}
                    {doc.due_date ? (
                      <div className="tabular-nums">
                        Vence {formatDate(doc.due_date)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {hasActions ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {showPaid && isBoleto ? (
                    <PaidToggle docId={doc.id} paid={doc.status === "paid"} />
                  ) : null}
                  {showPreview ? previewButton(doc) : null}
                  {showDownload ? downloadButton(doc) : null}
                  {showDelete ? (
                    <div className="ml-auto">{deleteButton(doc)}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ----- Desktop: tabela (só com as colunas que fazem sentido) ----- */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              {showClient ? (
                <th className="px-4 py-2.5 font-medium">Cliente</th>
              ) : null}
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              {hasCompetencia ? (
                <th className="px-4 py-2.5 font-medium">Competência</th>
              ) : null}
              {hasAmount ? (
                <th className="px-4 py-2.5 font-medium">Valor</th>
              ) : null}
              {hasDueDate ? (
                <th className="px-4 py-2.5 font-medium">Vencimento</th>
              ) : null}
              {hasBoleto ? (
                <th className="px-4 py-2.5 font-medium">Status</th>
              ) : null}
              {showPaidCol ? (
                <th className="px-4 py-2.5 font-medium">Pagamento</th>
              ) : null}
              {showActions ? <th className="px-4 py-2.5 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const isBoleto = doc.categoria === "boleto";
              return (
                <tr
                  key={doc.id}
                  className={cn("border-b last:border-0 hover:bg-muted/40")}
                >
                  {showClient ? (
                    <td className="px-4 py-3 font-medium">
                      {doc.company?.nome_fantasia ||
                        doc.company?.razao_social ||
                        "—"}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">{docTypeLabel(doc.type)}</td>
                  {hasCompetencia ? (
                    <td className="px-4 py-3 text-muted-foreground">
                      {doc.competencia || "—"}
                    </td>
                  ) : null}
                  {hasAmount ? (
                    <td className="px-4 py-3 tabular-nums">
                      {doc.amount != null ? formatCurrency(doc.amount) : "—"}
                    </td>
                  ) : null}
                  {hasDueDate ? (
                    <td className="px-4 py-3 tabular-nums">
                      {doc.due_date ? formatDate(doc.due_date) : "—"}
                    </td>
                  ) : null}
                  {hasBoleto ? (
                    <td className="px-4 py-3">{statusBadge(doc)}</td>
                  ) : null}
                  {showPaidCol ? (
                    <td className="px-4 py-3">
                      {isBoleto ? (
                        <PaidToggle docId={doc.id} paid={doc.status === "paid"} />
                      ) : null}
                    </td>
                  ) : null}
                  {showActions ? (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {showPreview ? previewButton(doc) : null}
                        {showDownload ? downloadButton(doc) : null}
                        {showDelete ? deleteButton(doc) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
