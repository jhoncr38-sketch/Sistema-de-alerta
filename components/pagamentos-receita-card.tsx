"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verificarPagamentosAgora } from "@/app/(admin)/painel/integracoes/serpro/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ResultadoVerificacao } from "@/lib/pagamentos-receita";

const CRITERIO: Record<string, string> = {
  numero: "mesmo nº do documento",
  periodo_valor: "mesma competência e valor",
  periodo_valor_com_acrescimos: "mesma competência, pago com multa/juros",
  valor_data: "mesmo valor, pago perto do vencimento",
};

/**
 * Pagamentos na Receita — roda à mão a verificação que o cron faz todo dia.
 * "Simular" só mostra o que seria marcado como pago; "Verificar e marcar" faz
 * de verdade (marca pago, avisa o cliente, anexa o comprovante da Receita).
 */
export function PagamentosReceitaCard({
  configurado,
  companies,
}: {
  configurado: boolean;
  companies: { id: string; label: string; cnpj: string }[];
}) {
  const [companyId, setCompanyId] = useState("");
  const [res, setRes] = useState<ResultadoVerificacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"simular" | "marcar" | null>(null);
  const [pending, startTransition] = useTransition();

  function rodar(dryRun: boolean) {
    setModo(dryRun ? "simular" : "marcar");
    setErro(null);
    startTransition(async () => {
      try {
        setRes(await verificarPagamentosAgora(companyId || null, dryRun));
      } catch (e) {
        setRes(null);
        setErro(e instanceof Error ? e.message : "Falha ao verificar.");
      }
    });
  }

  return (
    <Card className="px-5 py-4">
      <div className="flex items-start gap-3">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Pagamentos na Receita</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Procura na Receita as guias federais em aberto (DAS, DARF, parcelas) que já foram
              pagas. Roda sozinho todo dia às 7h. &ldquo;Simular&rdquo; não altera nada.
            </p>
          </div>

          <label className="block text-sm sm:max-w-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cliente</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Todos os clientes</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.cnpj}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!configurado || pending}
              onClick={() => rodar(true)}
            >
              {pending && modo === "simular" ? <Loader2 className="animate-spin" /> : null}
              Simular
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!configurado || pending}
              onClick={() => rodar(false)}
            >
              {pending && modo === "marcar" ? <Loader2 className="animate-spin" /> : null}
              Verificar e marcar como pagas
            </Button>
          </div>

          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

          {res ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              {!res.ok ? (
                <p className="text-destructive">{res.erro}</p>
              ) : (
                <p>
                  {res.empresasConsultadas} cliente(s) consultado(s), {res.guiasVerificadas} guia(s)
                  em aberto verificada(s).{" "}
                  <strong>
                    {res.confirmadas.length}{" "}
                    {res.dryRun ? "seria(m) marcada(s) como paga(s)" : "marcada(s) como paga(s)"}
                  </strong>
                  .
                </p>
              )}

              {res.confirmadas.length > 0 ? (
                <ul className="space-y-1.5">
                  {res.confirmadas.map((c) => (
                    <li key={c.docId} className="leading-snug">
                      <span className="font-medium">{c.empresa}</span> — {c.guia}
                      {c.valorGuia != null ? ` (${formatCurrency(c.valorGuia)})` : ""}
                      <span className="block text-xs text-muted-foreground">
                        Pago {formatCurrency(c.valorPago)}
                        {c.dataArrecadacao ? ` em ${formatDate(c.dataArrecadacao)}` : ""} ·{" "}
                        {CRITERIO[c.criterio] ?? c.criterio}
                        {c.comprovante ? " · comprovante anexado" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {res.falhas.length > 0 ? (
                <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                  {res.falhas.map((f, i) => (
                    <li key={i}>
                      {f.empresa}: {f.erro}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
