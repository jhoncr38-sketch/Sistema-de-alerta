"use client";

import { useRef, useTransition } from "react";
import { CircleCheck, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitDocumentRequest } from "@/app/actions/document-requests";

/**
 * Botão de envio de uma solicitação de documento (lado do cliente). Pendente:
 * botão "Enviar" que abre o seletor de arquivo. Enviado: selo verde + baixar +
 * "Trocar". O envio no prazo credita SJ Coins (tratado no server action).
 */
export function DocumentRequestUpload({
  id,
  submitted,
  fileName,
  viewUrl,
}: {
  id: string;
  submitted: boolean;
  fileName?: string | null;
  viewUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function pickFile() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        await submitDocumentRequest(id, fd);
        toast.success("Documento enviado!", {
          description: "Seu contador foi notificado.",
        });
      } catch (err) {
        toast.error("Falha ao enviar", {
          description: err instanceof Error ? err.message : "Tente novamente.",
        });
      }
    });
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg,.xlsx,.xls,.csv,.xml"
      className="hidden"
      onChange={onFileChange}
    />
  );

  if (!submitted) {
    return (
      <span className="inline-flex items-center gap-2">
        {hiddenInput}
        <Button type="button" size="sm" disabled={pending} onClick={pickFile}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />}
          Enviar
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {hiddenInput}
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="size-3.5" />
        Enviado
      </span>
      {viewUrl ? (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          title={fileName ?? "Baixar"}
          render={
            <a href={viewUrl} target="_blank" rel="noopener noreferrer">
              <Download />
              <span className="hidden sm:inline">Baixar</span>
            </a>
          }
        />
      ) : null}
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
    </span>
  );
}
