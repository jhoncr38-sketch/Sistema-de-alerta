"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveReissueRequest } from "@/app/actions/documents";
import { docTypeLabel } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocType } from "@/lib/types";

export interface ReissueItem {
  id: string;
  requested_at: string;
  document: {
    id: string;
    type: DocType;
    competencia: string | null;
    amount: number | null;
    due_date: string | null;
    company: { razao_social: string; nome_fantasia: string | null } | null;
  } | null;
}

/**
 * Lista, no painel do contador, os pedidos de 2ª via feitos pelos clientes.
 * Cada linha mostra o cliente + a guia vencida; o contador emite a 2ª via
 * (pela aba Receita/manual) e marca aqui como resolvido. Some quando vazia.
 */
export function ReissueRequests({ items }: { items: ReissueItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <RefreshCw className="size-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium">Pedidos de 2ª via</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {items.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Clientes pediram a 2ª via destes boletos vencidos. Emita a guia
        atualizada, publique e marque como resolvido.
      </p>
      <div className="divide-y rounded-xl border bg-card">
        {items.map((it) => (
          <ReissueRow key={it.id} item={it} />
        ))}
      </div>
    </section>
  );
}

function ReissueRow({ item }: { item: ReissueItem }) {
  const [pending, startTransition] = useTransition();
  const [feito, setFeito] = useState(false);
  const d = item.document;
  const cliente =
    d?.company?.nome_fantasia || d?.company?.razao_social || "Cliente";

  function resolver() {
    startTransition(async () => {
      await resolveReissueRequest(item.id);
      setFeito(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{cliente}</div>
        <div className="text-xs text-muted-foreground">
          {d ? docTypeLabel(d.type) : "Guia"}
          {d?.competencia ? ` · ${d.competencia}` : ""}
          {d?.amount != null ? ` · ${formatCurrency(d.amount)}` : ""}
          {d?.due_date ? ` · venceu ${formatDate(d.due_date)}` : ""}
        </div>
      </div>
      {feito ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" />
          Resolvido
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={resolver}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Marcar resolvido
        </Button>
      )}
    </div>
  );
}
