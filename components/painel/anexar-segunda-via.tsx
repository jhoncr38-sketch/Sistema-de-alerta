"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { lerBoletoUpload } from "@/app/(admin)/painel/enviar/actions";
import { anexarSegundaVia } from "@/app/(admin)/painel/tarefas-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const campo =
  "h-[34px] w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** "1.529,07" / "1529.07" → 1529.07. */
function parseValor(s: string): number {
  let t = s.trim().replace(/\s|R\$/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return Number(t);
}

/**
 * "Anexar" (caixa Para você fazer): o contador escolhe o PDF da 2ª via, a IA
 * preenche valor e vencimento, ele confere e publica — a guia é trocada, o
 * pedido resolvido e o cliente avisado.
 */
export function AnexarSegundaVia({
  requestId,
  titulo,
}: {
  requestId: string;
  /** Ex.: "Auto Peças Silva · DARF IRPJ 3º tri". */
  titulo: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, startEnvio] = useTransition();

  async function escolher(file: File) {
    setArquivo(file);
    if (file.type !== "application/pdf") return;
    setLendo(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await lerBoletoUpload(fd);
      if (r.ok) {
        if (r.valor != null)
          setValor(r.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (r.vencimento) setVencimento(r.vencimento);
      }
    } finally {
      setLendo(false);
    }
  }

  function publicar() {
    if (!arquivo) return;
    const fd = new FormData();
    fd.set("requestId", requestId);
    fd.set("file", arquivo);
    fd.set("valor", String(parseValor(valor)));
    fd.set("vencimento", vencimento);
    startEnvio(async () => {
      const r = await anexarSegundaVia(fd);
      if (r.ok) {
        toast.success(r.mensagem);
        setAberto(false);
        router.refresh();
      } else {
        toast.error(r.mensagem);
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" className="h-7 rounded-[7px] px-2.5 text-[13px]" onClick={() => setAberto(true)}>
        <Paperclip />
        Anexar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="gap-3 sm:max-w-md">
          <DialogTitle>Anexar 2ª via</DialogTitle>
          <p className="text-sm text-muted-foreground">{titulo}</p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void escolher(f);
            }}
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <Paperclip />
            {arquivo ? arquivo.name : "Escolher o PDF da 2ª via"}
          </Button>
          {lendo ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> A IA está lendo valor e vencimento…
            </p>
          ) : arquivo && (valor || vencimento) ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-amber-500" /> Preenchido pela IA — confira.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Valor (R$)</span>
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Vencimento</span>
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!arquivo || !valor || !vencimento || lendo || enviando} onClick={publicar}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              Publicar 2ª via
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
