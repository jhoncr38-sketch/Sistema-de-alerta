"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, EllipsisVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recusarSegundaVia, resolverSegundaVia } from "@/app/(admin)/painel/tarefas-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MOTIVO_PAGA = "A guia já foi paga.";

/**
 * "⋯" do pedido de 2ª via (caixa "Para você fazer"): marcar como resolvido
 * (2ª via enviada por fora) ou recusar o pedido com motivo.
 */
export function MaisAcoesSegundaVia({ requestId, titulo }: { requestId: string; titulo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recusarAberto, setRecusarAberto] = useState(false);
  const [tipoMotivo, setTipoMotivo] = useState<"paga" | "outro">("paga");
  const [outro, setOutro] = useState("");
  const [marcarPaga, setMarcarPaga] = useState(true);
  const [avisar, setAvisar] = useState(true);

  function resolver() {
    startTransition(async () => {
      const r = await resolverSegundaVia(requestId);
      if (r.ok) {
        toast.success(r.mensagem);
        router.refresh();
      } else toast.error(r.mensagem);
    });
  }

  function recusar() {
    const motivo = tipoMotivo === "paga" ? MOTIVO_PAGA : outro.trim();
    if (!motivo) {
      toast.error("Escreva o motivo.");
      return;
    }
    startTransition(async () => {
      const r = await recusarSegundaVia({
        requestId,
        motivo,
        avisar,
        marcarPaga: tipoMotivo === "paga" && marcarPaga,
      });
      if (r.ok) {
        toast.success(r.mensagem);
        setRecusarAberto(false);
        router.refresh();
      } else toast.error(r.mensagem);
    });
  }

  const vaiMarcarPaga = tipoMotivo === "paga" && marcarPaga;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label="Mais ações do pedido"
              title="Resolvido ou recusar"
              className="size-7 rounded-[7px]"
            />
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <EllipsisVertical />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={resolver}>
            <CircleCheck />
            Marcar como resolvido
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTimeout(() => setRecusarAberto(true), 10)}>
            <Ban />
            Recusar pedido…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={recusarAberto} onOpenChange={setRecusarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar pedido de 2ª via</DialogTitle>
            <DialogDescription>{titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Motivo</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="motivo"
                  checked={tipoMotivo === "paga"}
                  onChange={() => setTipoMotivo("paga")}
                  className="accent-primary"
                />
                A guia já foi paga
              </label>
              {tipoMotivo === "paga" ? (
                <label className="ml-6 flex items-center gap-2 text-[13px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={marcarPaga}
                    onChange={(e) => setMarcarPaga(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Marcar a guia como paga agora
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="motivo"
                  checked={tipoMotivo === "outro"}
                  onChange={() => setTipoMotivo("outro")}
                  className="accent-primary"
                />
                Outro motivo
              </label>
              {tipoMotivo === "outro" ? (
                <textarea
                  value={outro}
                  onChange={(e) => setOutro(e.target.value)}
                  maxLength={300}
                  rows={3}
                  autoFocus
                  placeholder="Ex.: esta guia foi substituída pelo parcelamento."
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              ) : null}
            </fieldset>

            {vaiMarcarPaga ? (
              <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Ao marcar como paga, o cliente recebe o e-mail de “pagamento confirmado” (como em
                qualquer baixa feita pelo contador).
              </p>
            ) : (
              <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={avisar}
                  onChange={(e) => setAvisar(e.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  Avisar o cliente por e-mail
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Ele recebe o motivo e pode pedir de novo pelo portal se precisar.
                  </span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancelar</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={recusar}>
              {pending ? <Loader2 className="animate-spin" /> : <Ban />}
              Recusar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
