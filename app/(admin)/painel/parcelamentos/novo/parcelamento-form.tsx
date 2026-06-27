"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { UploadCloud, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCurrency } from "@/components/masked-inputs";
import { PARCELAMENTO_MODALIDADES } from "@/lib/constants";
import { createInstallmentPlan, type PlanState } from "../actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface Parcela {
  file: File;
  num: string; // número da parcela (1..total)
  amount: string; // mascarado "1.240,00"
  due: string; // "YYYY-MM-DD"
}

/** Ordena por nome de arquivo de forma "natural" (parcela 2 antes de parcela 10). */
function naturalSort(a: File, b: File): number {
  return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
}

/** "2026-06-20" + n meses -> "2026-08-20" (mantém o dia). */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1 + n, d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function ParcelamentoForm({
  companies,
}: {
  companies: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<PlanState, FormData>(
    createInstallmentPlan,
    {},
  );

  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [valorPadrao, setValorPadrao] = useState("");
  const [primeiroVenc, setPrimeiroVenc] = useState("");

  const totalGeral = useMemo(
    () =>
      parcelas.reduce((acc, p) => {
        const n = Number(p.amount.replace(/\./g, "").replace(",", "."));
        return acc + (Number.isNaN(n) ? 0 : n);
      }, 0),
    [parcelas],
  );

  function onPickFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).sort(naturalSort);
    setParcelas(
      files.map((file, i) => ({
        file,
        num: String(i + 1), // sugere 1, 2, 3... (editável)
        amount: "",
        due: "",
      })),
    );
  }

  function setParcela(i: number, patch: Partial<Parcela>) {
    setParcelas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function removeParcela(i: number) {
    setParcelas((prev) => prev.filter((_, idx) => idx !== i));
  }

  function aplicarATodas() {
    setParcelas((prev) =>
      prev.map((p, i) => ({
        ...p,
        amount: valorPadrao || p.amount,
        due: primeiroVenc ? addMonths(primeiroVenc, i) : p.due,
      })),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // company_id, modalidade, nome e total vêm dos inputs com name.
    const fd = new FormData(e.currentTarget);
    for (const p of parcelas) {
      fd.append("file", p.file);
      fd.append("num", p.num);
      fd.append("amount", p.amount);
      fd.append("due", p.due);
    }
    // useActionState exige que o dispatch rode dentro de uma transition.
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          <Label htmlFor="modalidade">Modalidade do parcelamento</Label>
          <select id="modalidade" name="modalidade" className={selectClass} required defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {PARCELAMENTO_MODALIDADES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nome">
            Nome do parcelamento{" "}
            <span className="text-muted-foreground">— opcional</span>
          </Label>
          <Input id="nome" name="nome" placeholder="Usa a modalidade se ficar em branco" />
          <p className="text-xs text-muted-foreground">
            Título exibido no card. Obrigatório se a modalidade for “Outro”.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="total">Total de parcelas</Label>
          <Input
            id="total"
            name="total"
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            placeholder="Ex.: 22"
            required
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Quantas parcelas o parcelamento tem no total (ex.: 22).
          </p>
        </div>
      </div>

      {/* Anexar parcelas que já tem (opcional) */}
      <div className="space-y-1.5">
        <Label htmlFor="file">
          Parcelas disponíveis{" "}
          <span className="text-muted-foreground">— opcional</span>
        </Label>
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <UploadCloud className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Anexe as guias que você já tem (pode ser só a 1ª). As próximas você
            adiciona mês a mês depois.
          </p>
          <Input
            id="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            multiple
            onChange={(e) => onPickFiles(e.target.files)}
            className="mx-auto mt-3 max-w-xs"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            A numeração segue a ordem do nome do arquivo (ajustável abaixo).
          </p>
        </div>
      </div>

      {parcelas.length > 0 ? (
        <>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wand2 className="size-4 text-primary" />
              Preencher rápido
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Opcional: aplica um valor a todas e gera os vencimentos mensais a
              partir do 1º. Depois ajuste as que diferem.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="valorPadrao">Valor de cada (R$)</Label>
                <Input
                  id="valorPadrao"
                  inputMode="decimal"
                  placeholder="1.240,00"
                  value={valorPadrao}
                  onChange={(e) => setValorPadrao(maskCurrency(e.target.value))}
                  className="w-36"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="primeiroVenc">1º vencimento</Label>
                <Input
                  id="primeiroVenc"
                  type="date"
                  value={primeiroVenc}
                  onChange={(e) => setPrimeiroVenc(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button type="button" variant="outline" onClick={aplicarATodas}>
                Aplicar a todas
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {parcelas.length}{" "}
                {parcelas.length === 1 ? "parcela anexada" : "parcelas anexadas"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                Total:{" "}
                {totalGeral.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </div>
            <div className="space-y-2">
              {parcelas.map((p, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="w-16 shrink-0 space-y-1">
                    <div className="text-xs text-muted-foreground">Parcela nº</div>
                    <Input
                      aria-label={`Número da parcela ${i + 1}`}
                      type="number"
                      min={1}
                      value={p.num}
                      onChange={(e) => setParcela(i, { num: e.target.value })}
                      className="w-16"
                      required
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate text-xs text-muted-foreground" title={p.file.name}>
                      {p.file.name}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        aria-label={`Valor da parcela ${i + 1}`}
                        inputMode="decimal"
                        placeholder="Valor (R$)"
                        value={p.amount}
                        onChange={(e) =>
                          setParcela(i, { amount: maskCurrency(e.target.value) })
                        }
                        className="w-32"
                        required
                      />
                      <Input
                        aria-label={`Vencimento da parcela ${i + 1}`}
                        type="date"
                        value={p.due}
                        onChange={(e) => setParcela(i, { due: e.target.value })}
                        className="w-40"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeParcela(i)}
                    aria-label={`Remover parcela ${i + 1}`}
                    title="Remover"
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar parcelamento"}
        </Button>
      </div>
    </form>
  );
}
