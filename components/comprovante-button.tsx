"use client";

import { useRef, useState, useTransition } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  attachComprovante,
  removeComprovante,
} from "@/app/actions/documents";

/**
 * Clipe discreto de comprovante de pagamento — OPCIONAL. Só aparece em guias já
 * pagas (boletos/parcelas); guia em aberto não mostra nada. Sem comprovante:
 * clipe cinza que abre o seletor de arquivo. Com comprovante: clipe verde que
 * abre o preview na tela, com baixar / trocar / remover.
 */
export function ComprovanteButton({
  docId,
  paid,
  hasComprovante,
  fileName,
}: {
  docId: string;
  paid: boolean;
  hasComprovante: boolean;
  fileName?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Guia em aberto não mostra nada — a linha fica idêntica à de antes.
  if (!paid) return null;

  function pickFile() {
    setError(null);
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        await attachComprovante(docId, fd);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao anexar.");
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      try {
        await removeComprovante(docId);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao remover.");
      }
    });
  }

  const viewUrl = `/api/documents/${docId}/download?tipo=comprovante&view=1`;
  const downloadUrl = `/api/documents/${docId}/download?tipo=comprovante`;

  // Input escondido, reusado por "anexar" e "trocar".
  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg"
      className="hidden"
      onChange={onFileChange}
    />
  );

  // --- Pago, sem comprovante: clipe cinza "Comprovante" (anexar) ---
  if (!hasComprovante) {
    return (
      <span className="inline-flex items-center gap-1">
        {hiddenInput}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          title="Anexar comprovante (opcional)"
          onClick={pickFile}
          className="text-muted-foreground"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Paperclip />}
          <span className="hidden sm:inline">Comprovante</span>
        </Button>
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
      </span>
    );
  }

  // --- Pago, com comprovante: clipe verde + modal de preview/ações ---
  return (
    <>
      {hiddenInput}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Ver comprovante"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        <Paperclip />
        <span className="hidden sm:inline">Comprovante</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-sm font-medium">
              Comprovante{fileName ? ` · ${fileName}` : ""}
            </DialogTitle>
          </div>

          {open ? (
            <iframe
              src={viewUrl}
              title="Comprovante de pagamento"
              className="min-h-0 w-full flex-1 bg-muted/30"
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-4 py-2.5">
            {error ? (
              <span className="mr-auto text-xs text-destructive">{error}</span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  <span className="hidden sm:inline">Abrir em nova aba</span>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={pickFile}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              Trocar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
