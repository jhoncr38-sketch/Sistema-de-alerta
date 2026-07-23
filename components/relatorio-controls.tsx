"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Barra de controle do relatório (só o contador vê; some na impressão porque
 * fica fora de #report-sheet). Escolhe a empresa, navega os meses, baixa o PDF
 * (o mesmo arquivo que é anexado) e envia por e-mail ao cliente com o PDF.
 */
export function RelatorioControls({
  companies,
  selectedId,
  competencia,
  badge,
  prevYm,
  nextYm,
  clienteNome,
  pdfHref,
  sendAction,
}: {
  companies: { id: string; label: string }[];
  selectedId: string;
  competencia: string;
  badge: string; // "Junho · 2026"
  prevYm: string;
  nextYm: string | null;
  clienteNome: string;
  pdfHref: string;
  sendAction: () => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (empresa: string, mes: string) =>
    router.push(`/painel/relatorio?empresa=${empresa}&mes=${mes}`);

  function enviar() {
    if (
      !window.confirm(
        `Enviar o resumo de ${badge} para ${clienteNome} por e-mail?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => go(e.target.value, competencia)}
          className="h-8 max-w-[240px] rounded-lg border border-input bg-background px-2.5 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Cliente"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => go(selectedId, prevYm)}
            aria-label="Mês anterior"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-[104px] text-center text-sm font-semibold">
            {badge}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => nextYm && go(selectedId, nextYm)}
            disabled={!nextYm}
            aria-label="Próximo mês"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(pdfHref, "_blank")}
        >
          <Download />
          Baixar PDF
        </Button>
        <Button size="sm" onClick={enviar} disabled={pending}>
          <Send />
          {pending ? "Enviando…" : "Enviar ao cliente"}
        </Button>
      </div>
    </div>
  );
}
