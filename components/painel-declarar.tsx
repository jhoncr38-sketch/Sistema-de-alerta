"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { DeclararPgdasCard } from "@/components/declarar-pgdas-card";
import { Card } from "@/components/ui/card";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/**
 * Aba "Declarar" (tela Enviar documento): escolhe o cliente e faz a declaração
 * mensal do Simples Nacional (PGDAS-D) direto na Receita — simular, conferir e
 * transmitir. Fica separada de "Pendências e boletos" porque é outra tarefa:
 * aqui se ENTREGA uma declaração; lá se consulta e se emite guia.
 */
export function PainelDeclarar({
  companies,
  configurado,
  empresaInicial,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
  /** Cliente já escolhido (vindo de outra tela). */
  empresaInicial?: string;
}) {
  const [companyId, setCompanyId] = useState(
    empresaInicial && companies.some((c) => c.id === empresaInicial) ? empresaInicial : "",
  );

  return (
    <Card className="max-w-4xl space-y-5 px-6 py-6">
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Calculator className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Declarar o Simples Nacional (PGDAS-D)</h2>
          <p className="text-xs text-muted-foreground">
            Informe a receita do mês, simule o imposto na Receita e transmita a declaração. Depois de
            transmitir, o DAS é gerado e publicado para o cliente.
          </p>
        </div>
      </div>

      {!configurado ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          A integração com a Receita ainda não está configurada.
        </p>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Cliente</span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Escolha o cliente…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {configurado && companyId ? (
        <div className="border-t pt-5">
          {/* `key`: trocar de cliente zera o formulário (nunca reaproveita dados de outro). */}
          <DeclararPgdasCard key={companyId} companies={companies} companyId={companyId} configurado={configurado} />
        </div>
      ) : null}
    </Card>
  );
}
