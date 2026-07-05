import { Download, FileText } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import { ComprovanteButton } from "@/components/comprovante-button";
import { ConfirmPaymentButtons } from "@/components/confirm-payment-buttons";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ExplicarGuiaButton } from "@/components/explicar-guia-button";
import { FilePreviewButton } from "@/components/file-preview-button";
import { Button } from "@/components/ui/button";
import { PaidToggle } from "@/components/paid-toggle";
import { RequireProofToggle } from "@/components/require-proof-toggle";
import { StatusBadge } from "@/components/status-badge";
import { docTypeLabel } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Guias a pagar" — têm valor, vencimento, status e podem ser marcadas pagas. */
function isPagavel(d: DocumentWithCompany): boolean {
  return d.categoria === "boleto" || d.categoria === "parcelamento";
}

/** Rótulo da coluna "Tipo": parcela mostra "Parcela N"; o resto, o tipo da guia.
 *  Quando o tipo é "Outro" e há descrição livre, usa a descrição (mais útil ao
 *  cliente do que o genérico "Outro"). */
function tipoLabel(d: DocumentWithCompany): string {
  if (d.categoria === "parcelamento" && d.parcela_num) {
    return `Parcela ${d.parcela_num}`;
  }
  if (d.type === "outro" && d.descricao) {
    return d.descricao;
  }
  return docTypeLabel(d.type);
}

export function DocumentsTable({
  documents,
  showClient = false,
  showDownload = false,
  showPreview = false,
  showPaid = false,
  showDelete = false,
  showRequireProof = false,
  enforceProof = false,
  isAdmin = false,
  hideCompetencia = false,
  competenciaInline = false,
  subtleActions = false,
  showTypeIcon = false,
  showExplain = false,
  flush = false,
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
  /** Só do contador: botão de exigir/dispensar comprovante por guia. */
  showRequireProof?: boolean;
  /** Telas do cliente: aplica a exigência de comprovante no botão "marcar pago". */
  enforceProof?: boolean;
  /** Telas do contador: mostra Confirmar/Rejeitar quando a guia está aguardando,
   *  e marca pago vai direto para confirmado. */
  isAdmin?: boolean;
  /** Oculta a coluna Competência (ex.: quando já está agrupado por mês). */
  hideCompetencia?: boolean;
  /** Remove a coluna Competência e a mostra como subtítulo discreto sob o Tipo
   *  (deixa a tabela mais enxuta no dashboard, onde quase tudo é "—"). */
  competenciaInline?: boolean;
  /** Deixa as ações menos chamativas: "marcar pago" outline e "baixar" só ícone.
   *  Usado no dashboard do contador (visão geral, ações são secundárias). */
  subtleActions?: boolean;
  /** Mostra um ícone colorido por tipo de documento (telas do cliente). */
  showTypeIcon?: boolean;
  /** Telas do cliente: botão "O que é isso?" que explica o tipo da guia (IA). */
  showExplain?: boolean;
  /** Sem borda/cartão externo no desktop — para usar dentro de outro cartão. */
  flush?: boolean;
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
  // não têm competência; e só guias a pagar têm status (vencido/pago).
  const hasCompetencia =
    !hideCompetencia &&
    !competenciaInline &&
    documents.some((d) => !!d.competencia);
  const hasAmount = documents.some((d) => d.amount != null);
  const hasDueDate = documents.some((d) => d.due_date != null);
  const hasPagavel = documents.some(isPagavel);
  const showPaidCol = showPaid && hasPagavel;

  // Selo de status (guia com vencimento) ou "Informativo" — usado nos dois layouts.
  function statusBadge(doc: DocumentWithCompany) {
    if (isPagavel(doc) && doc.due_date) {
      return <StatusBadge dueDate={doc.due_date} status={doc.status} />;
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
        <FileText className="size-3" />
        Informativo
      </span>
    );
  }

  // Controle de pagamento por guia: no painel do contador, uma guia aguardando
  // vira Confirmar/Rejeitar; nos demais casos é o toggle de marcar/desmarcar.
  // `compact`: usa a versão curta do estado "aguardando" (o selo de status já
  // aparece ao lado, então não repetimos a frase inteira).
  function paidControl(doc: DocumentWithCompany, compact = false) {
    if (isAdmin && doc.status === "aguardando") {
      return <ConfirmPaymentButtons docId={doc.id} />;
    }
    return (
      <PaidToggle
        docId={doc.id}
        paid={doc.status === "paid"}
        status={doc.status}
        isAdmin={isAdmin}
        compactWaiting={compact}
        requireComprovante={enforceProof && doc.exige_comprovante}
        hasComprovante={!!doc.comprovante_path}
        unpaidVariant={subtleActions ? "outline" : "default"}
      />
    );
  }

  /** No cartão mobile o status já aparece no topo — para o cliente com guia
   *  aguardando, o controle de pagamento repetiria a mesma informação, então
   *  não é renderizado. Nos demais casos, mostra o controle normal. */
  function showPaidControlMobile(doc: DocumentWithCompany): boolean {
    return !(doc.status === "aguardando" && !isAdmin);
  }

  function previewButton(doc: DocumentWithCompany) {
    const nome =
      tipoLabel(doc) + (doc.competencia ? ` · ${doc.competencia}` : "");
    return <FilePreviewButton docId={doc.id} fileName={nome} />;
  }

  /** Botão "O que é isso?" — só para guias a pagar (que têm um imposto/tributo
   *  no `type`). Documentos institucionais e folha não recebem. */
  function explainButton(doc: DocumentWithCompany) {
    if (!isPagavel(doc)) return null;
    return <ExplicarGuiaButton type={doc.type} label={tipoLabel(doc)} />;
  }

  function downloadButton(doc: DocumentWithCompany) {
    if (subtleActions) {
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Baixar"
          nativeButton={false}
          render={
            <a href={`/api/documents/${doc.id}/download`}>
              <Download />
            </a>
          }
        />
      );
    }
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
              {tipoLabel(doc)}
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
      <div className={cn("space-y-2.5 md:hidden", flush ? "p-2.5" : "")}>
        {documents.map((doc) => {
          const pagavel = isPagavel(doc);
          const hasActions = (showPaid && pagavel) || showActions;
          return (
            <div key={doc.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {showTypeIcon ? <DocTypeIcon doc={doc} /> : null}
                  <div className="min-w-0">
                    {showClient ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {doc.company?.nome_fantasia ||
                          doc.company?.razao_social ||
                          "—"}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1 font-medium leading-snug">
                      <span className="min-w-0 truncate">{tipoLabel(doc)}</span>
                      {showExplain ? explainButton(doc) : null}
                    </div>
                  </div>
                </div>
                {hasPagavel ? (
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
                  {showPaid && pagavel && showPaidControlMobile(doc)
                    ? paidControl(doc)
                    : null}
                  {showPaid && pagavel ? (
                    <ComprovanteButton
                      docId={doc.id}
                      paid={doc.status === "paid"}
                      hasComprovante={!!doc.comprovante_path}
                      fileName={doc.comprovante_name}
                    />
                  ) : null}
                  {showRequireProof && pagavel ? (
                    <RequireProofToggle
                      docId={doc.id}
                      value={doc.exige_comprovante}
                    />
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
      <div
        className={cn(
          "hidden overflow-x-auto md:block",
          flush ? "" : "rounded-xl border bg-card",
        )}
      >
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
              {hasPagavel ? (
                <th className="px-4 py-2.5 font-medium">Status</th>
              ) : null}
              {showPaidCol ? (
                <th className="px-4 py-2.5 font-medium">Pagamento</th>
              ) : null}
              {showActions ? (
                <th className="w-px px-4 py-2.5 font-medium" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const pagavel = isPagavel(doc);
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {showTypeIcon ? <DocTypeIcon doc={doc} /> : null}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 truncate">
                            {tipoLabel(doc)}
                          </span>
                          {showExplain ? explainButton(doc) : null}
                        </div>
                        {competenciaInline && doc.competencia ? (
                          <div className="text-xs text-muted-foreground">
                            Comp. {doc.competencia}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
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
                  {hasPagavel ? (
                    <td className="px-4 py-3">{statusBadge(doc)}</td>
                  ) : null}
                  {showPaidCol ? (
                    <td className="px-4 py-3">
                      {pagavel ? (
                        <div className="flex items-center gap-1">
                          {paidControl(doc, true)}
                          <ComprovanteButton
                            docId={doc.id}
                            paid={doc.status === "paid"}
                            hasComprovante={!!doc.comprovante_path}
                            fileName={doc.comprovante_name}
                          />
                          {showRequireProof ? (
                            <RequireProofToggle
                              docId={doc.id}
                              value={doc.exige_comprovante}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  {showActions ? (
                    <td className="w-px px-4 py-3 whitespace-nowrap">
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
