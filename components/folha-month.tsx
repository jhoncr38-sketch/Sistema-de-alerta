"use client";

import { useState } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { deleteDocument } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { FilePreviewButton } from "@/components/file-preview-button";
import type { DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Nome do arquivo sem a extensão, para exibir limpo. */
function nomeArquivo(d: DocumentWithCompany): string {
  return (d.file_name ?? "").replace(/\.[^.]+$/, "");
}

/** Um mês da folha: cabeçalho clicável que recolhe/expande os arquivos. */
export function FolhaMonth({
  titulo,
  docs,
  defaultOpen = false,
  showDelete = false,
}: {
  titulo: string;
  docs: DocumentWithCompany[];
  defaultOpen?: boolean;
  /** Mostra o botão de excluir cada arquivo (só no painel do contador). */
  showDelete?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open ? "" : "-rotate-90",
            )}
          />
          <span className="font-medium">{titulo}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {docs.length} {docs.length === 1 ? "arquivo" : "arquivos"}
        </span>
      </button>

      {open ? (
        <ul className="divide-y border-t">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{nomeArquivo(d)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <FilePreviewButton docId={d.id} fileName={nomeArquivo(d)} />
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a href={`/api/documents/${d.id}/download`}>
                      <Download />
                      <span className="hidden sm:inline">Baixar</span>
                    </a>
                  }
                />
                {showDelete ? (
                  <ConfirmDeleteButton
                    action={deleteDocument.bind(null, d.id)}
                    title="Apagar arquivo da folha?"
                    confirmLabel="Apagar arquivo"
                    successMessage="Arquivo apagado."
                    description={
                      <>
                        O arquivo <strong>{nomeArquivo(d)}</strong>
                        {d.competencia ? ` (${d.competencia})` : ""} será
                        removido do sistema junto com o documento. Esta ação não
                        pode ser desfeita.
                      </>
                    }
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
