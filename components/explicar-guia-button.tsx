"use client";

import { useState } from "react";
import { HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DocType } from "@/lib/types";

/**
 * Botão "O que é isso?" — explica, em linguagem simples, o tipo da guia
 * (DAS, DARF, INSS...) para o cliente leigo. Só no portal do cliente.
 *
 * Ícone discreto de interrogação; ao abrir, busca a explicação em
 * POST /api/explicar-guia (o servidor tem o texto em cache por tipo, então quase
 * sempre responde na hora). Guarda o texto no estado para não rebuscar ao
 * reabrir. Não pesa a página: nada é carregado até o cliente tocar no ícone.
 */
export function ExplicarGuiaButton({
  type,
  label,
  categoria,
}: {
  type: DocType;
  /** Rótulo do tipo, exibido como título (ex.: "DAS - Simples Nacional"). */
  label: string;
  /** Categoria da guia. "parcelamento" faz explicar o parcelamento, não o tipo. */
  categoria?: string;
}) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  // Numa parcela, o que interessa é explicar o PARCELAMENTO (não o tributo).
  // Mantém o "Parcela N" no título, mas deixa claro que se trata de parcelamento.
  const ehParcelamento = categoria === "parcelamento";
  const titulo = ehParcelamento
    ? label.toLowerCase().includes("parcela")
      ? `${label} · Parcelamento`
      : "Parcelamento"
    : label;

  async function carregar() {
    if (texto || carregando) return; // já temos (ou já buscando)
    setCarregando(true);
    setErro(false);
    try {
      const res = await fetch("/api/explicar-guia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, categoria }),
      });
      const data = (await res.json().catch(() => ({}))) as { texto?: string };
      if (!res.ok || !data.texto) {
        setErro(true);
        return;
      }
      setTexto(data.texto);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }

  function abrir() {
    setOpen(true);
    void carregar();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={abrir}
        title="O que é isso?"
        aria-label={`O que é ${titulo}?`}
        className="text-muted-foreground"
      >
        <HelpCircle />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Sparkles className="size-4" />
            </span>
            <DialogTitle className="leading-snug">{titulo}</DialogTitle>
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Explicando…
            </div>
          ) : erro ? (
            <p className="text-sm text-muted-foreground">
              Não consegui carregar a explicação agora. Tente novamente em
              instantes ou fale com seu contador.
            </p>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {texto}
            </p>
          )}

          <p className="border-t pt-2 text-xs text-muted-foreground">
            Explicação geral, gerada automaticamente. Não substitui a orientação
            do seu contador.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
