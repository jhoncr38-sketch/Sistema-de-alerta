"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  attachBoletoParcela,
  removeBoletoParcela,
} from "@/app/actions/documents";

/**
 * Anexar/baixar o boleto de uma PARCELA de débito automático (painel do
 * contador). No débito automático a parcela nasce sem boleto; quando o débito
 * não cai, o contador anexa o boleto aqui para o cliente pagar avulso.
 *
 *   • sem boleto  -> botão "Anexar boleto" (abre o seletor de arquivo);
 *   • com boleto  -> "Baixar" + "Trocar" + "Remover".
 *
 * Reusa a rota /api/documents/[id]/download (file_path) já existente.
 */
export function AnexarBoletoParcela({
  docId,
  hasBoleto,
}: {
  docId: string;
  hasBoleto: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        await attachBoletoParcela(docId, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao anexar.");
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      try {
        await removeBoletoParcela(docId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao remover.");
      }
    });
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,image/png,image/jpeg"
      className="hidden"
      onChange={onFileChange}
    />
  );

  // --- Sem boleto: botão "Anexar boleto" ---
  if (!hasBoleto) {
    return (
      <span className="inline-flex items-center gap-1">
        {hiddenInput}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          title="Anexar boleto desta parcela"
          onClick={pickFile}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Upload />}
          Anexar boleto
        </Button>
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
      </span>
    );
  }

  // --- Com boleto: baixar + trocar + remover ---
  return (
    <span className="inline-flex items-center gap-1">
      {hiddenInput}
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={
          <a href={`/api/documents/${docId}/download`}>
            <Download />
            Baixar
          </a>
        }
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="Trocar o boleto"
        onClick={pickFile}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        <span className="hidden sm:inline">Trocar</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="Remover o boleto"
        onClick={onRemove}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </span>
  );
}
