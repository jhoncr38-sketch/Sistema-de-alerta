"use client";

import { useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { updateRedemptionStatus } from "@/app/(admin)/painel/rewards/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Botões de entrega/cancelamento de um resgate (lado do contador). */
export function RedemptionActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  function run(next: "fulfilled" | "canceled") {
    startTransition(async () => {
      try {
        await updateRedemptionStatus(id, next);
        toast.success(
          next === "fulfilled" ? "Resgate entregue." : "Resgate cancelado e estornado.",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  }

  if (status === "canceled") {
    return <Badge variant="outline">Cancelado</Badge>;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "fulfilled" ? (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          Entregue
        </Badge>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run("fulfilled")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Entregar
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run("canceled")}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Cancelar e estornar as moedas"
      >
        <X />
        <span className="hidden sm:inline">Cancelar</span>
      </Button>
    </div>
  );
}
