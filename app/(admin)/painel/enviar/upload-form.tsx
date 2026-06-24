"use client";

import { useActionState, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIA_LABELS, docTypeOptionsFor } from "@/lib/constants";
import type { DocCategoria } from "@/lib/types";
import { uploadDocument, type UploadState } from "./actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function UploadForm({
  companies,
}: {
  companies: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadDocument,
    {},
  );

  const [categoria, setCategoria] = useState<DocCategoria>("boleto");
  const [type, setType] = useState("");
  const isBoleto = categoria === "boleto";
  const typeOptions = docTypeOptionsFor(categoria);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="company_id">Cliente</Label>
          <select id="company_id" name="company_id" className={selectClass} required defaultValue="">
            <option value="" disabled>
              Selecione o cliente...
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categoria">Tipo de envio</Label>
          <select
            id="categoria"
            name="categoria"
            className={selectClass}
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value as DocCategoria);
              setType(""); // tipo depende da categoria
            }}
          >
            {(Object.keys(CATEGORIA_LABELS) as DocCategoria[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isBoleto
              ? "Vai para a aba “Meus boletos” do cliente — com valor, vencimento e alerta de pagamento."
              : "Vai para a aba “Documentos” do cliente — apenas para baixar (sem valor ou vencimento)."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type">
            {isBoleto ? "Tipo de imposto" : "Tipo de documento"}
          </Label>
          <select
            id="type"
            name="type"
            className={selectClass}
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="" disabled>
              Selecione...
            </option>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="competencia">Competência (mês/ano)</Label>
          <Input id="competencia" name="competencia" placeholder="06/2026" required />
        </div>

        {isBoleto ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input id="amount" name="amount" inputMode="decimal" placeholder="1.240,00" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due_date">Data de vencimento</Label>
              <Input id="due_date" name="due_date" type="date" required />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="faturamento">
                Faturamento do mês (R$){" "}
                <span className="text-muted-foreground">— opcional</span>
              </Label>
              <Input
                id="faturamento"
                name="faturamento"
                inputMode="decimal"
                placeholder="50.000,00"
              />
              <p className="text-xs text-muted-foreground">
                Faturamento bruto da empresa nesta competência. Alimenta o
                dashboard de faturamento × carga tributária.
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Documentos/relatórios são apenas para o cliente baixar — não têm
            valor, vencimento nem alerta de pagamento.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="file">
          {isBoleto ? "Arquivo do boleto" : "Arquivo do documento"}
        </Label>
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <UploadCloud className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione o PDF {isBoleto ? "do boleto" : "do documento"} (até 10MB)
          </p>
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            required
            className="mx-auto mt-3 max-w-xs"
          />
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando..." : "Publicar para o cliente"}
        </Button>
      </div>
    </form>
  );
}
