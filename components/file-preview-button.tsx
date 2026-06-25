"use client";

import { useState } from "react";
import { Download, ExternalLink, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Botão "Visualizar" que abre o arquivo num preview DENTRO da página (modal),
 * sem ir para outra aba nem baixar. Tem atalhos para abrir em nova aba e baixar.
 */
export function FilePreviewButton({
  docId,
  fileName,
}: {
  docId: string;
  fileName: string;
}) {
  const [open, setOpen] = useState(false);
  const viewUrl = `/api/documents/${docId}/download?view=1`;
  const downloadUrl = `/api/documents/${docId}/download`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Eye />
        <span className="hidden sm:inline">Visualizar</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-sm font-medium">
              {fileName}
            </DialogTitle>
          </div>

          {open ? (
            <iframe
              src={viewUrl}
              title={fileName}
              className="min-h-0 w-full flex-1 bg-muted/30"
            />
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t bg-muted/40 px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Abrir em nova aba
                </a>
              }
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={downloadUrl}>
                  <Download />
                  Baixar
                </a>
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
