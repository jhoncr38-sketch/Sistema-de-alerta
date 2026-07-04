"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Info, UploadCloud } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompetenciaInput, CurrencyInput } from "@/components/masked-inputs";
import {
  CATEGORIA_LABELS,
  UPLOAD_CATEGORIAS,
  docTypeOptionsFor,
} from "@/lib/constants";
import { normalizeCompetencia } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { DocCategoria } from "@/lib/types";
import { uploadDocument, type UploadState } from "./actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Tipos de imposto que não usam o "Faturamento do mês" (encargos + mensalidade). */
const TIPOS_SEM_FATURAMENTO = new Set(["gps_inss", "fgts", "mensalidade"]);

/** "1.240,00" / "1240.50" / "1240" -> número (espelha o parseAmount do back-end). */
function parseBrl(raw: string): number {
  let s = raw.trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export interface RevenueRef {
  companyId: string;
  competencia: string;
  amount: number;
}

export function UploadForm({
  companies,
  revenues,
}: {
  companies: { id: string; label: string }[];
  revenues: RevenueRef[];
}) {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadDocument,
    {},
  );

  const [categoria, setCategoria] = useState<DocCategoria>("boleto");
  const [type, setType] = useState("");
  // Espelho dos campos que definem a duplicidade do faturamento.
  const [companyId, setCompanyId] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [faturamento, setFaturamento] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  // Modo do faturamento quando já existe um no mês: replace | add | skip.
  // Imperativo (ref) para o valor estar no DOM antes do requestSubmit.
  const modeRef = useRef<HTMLInputElement>(null);

  const isBoleto = categoria === "boleto";
  const isFolha = categoria === "folha";
  const isDocumento = categoria === "documento";
  // Boleto e folha têm mês de referência; documento da empresa, não.
  const precisaCompetencia = !isDocumento;
  const typeOptions = docTypeOptionsFor(categoria);
  // INSS, FGTS e a mensalidade não compõem a carga tributária, então não faz
  // sentido informar o faturamento do mês junto deles — esconde o campo.
  const semFaturamento = TIPOS_SEM_FATURAMENTO.has(type);
  const mostraFaturamento = isBoleto && !semFaturamento;

  // Faturamento já lançado para (cliente, competência), se houver.
  const revenueByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of revenues) {
      m.set(`${r.companyId}|${normalizeCompetencia(r.competencia)}`, r.amount);
    }
    return m;
  }, [revenues]);

  const existing =
    companyId && competencia
      ? revenueByKey.get(`${companyId}|${normalizeCompetencia(competencia)}`)
      : undefined;
  const novo = parseBrl(faturamento);
  const faturamentoFilled = faturamento.trim() !== "" && novo > 0;
  // Só há o que confirmar se: o campo está visível, há valor digitado e o mês já tem faturamento.
  const hasDuplicate =
    mostraFaturamento && faturamentoFilled && existing != null;

  // Qualquer edição zera o modo: ele só vale para o envio confirmado no diálogo.
  const resetMode = () => {
    if (modeRef.current) modeRef.current.value = "replace";
  };

  const submitWithMode = (mode: "replace" | "add" | "skip") => {
    if (modeRef.current) modeRef.current.value = mode;
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="company_id">Cliente</Label>
          <select
            id="company_id"
            name="company_id"
            className={selectClass}
            required
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              resetMode();
            }}
          >
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
              const c = e.target.value as DocCategoria;
              setCategoria(c);
              setType(c === "folha" ? "folha" : ""); // folha tem tipo único
              // Os campos mascarados remontam (key={categoria}); zera o espelho.
              setCompetencia("");
              setFaturamento("");
              resetMode();
            }}
          >
            {UPLOAD_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABELS[c]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isBoleto
              ? "Vai para a aba “Meus boletos” do cliente — com valor, vencimento e alerta de pagamento."
              : isFolha
                ? "Vai para a aba “Folha de pagamento” do cliente — uma por mês (competência)."
                : "Vai para a aba “Documentos” do cliente — documentos da empresa, apenas para baixar."}
          </p>
        </div>

        {isFolha ? (
          <input type="hidden" name="type" value="folha" />
        ) : (
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
              onChange={(e) => {
                const t = e.target.value;
                setType(t);
                // Ao trocar para INSS/FGTS/mensalidade o campo de faturamento
                // some; zera o espelho pra não submeter um valor invisível.
                if (TIPOS_SEM_FATURAMENTO.has(t)) {
                  setFaturamento("");
                  resetMode();
                }
              }}
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
        )}

        {/* "Outro" não diz nada ao cliente — abre um campo livre pra descrever o
            documento (ex.: "Certidão Negativa"). Fica visível na tela dele. */}
        {type === "outro" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="descricao">Descrição do documento</Label>
            <Input
              id="descricao"
              name="descricao"
              maxLength={120}
              required
              placeholder="Ex.: Certidão Negativa de Débitos"
            />
            <p className="text-xs text-muted-foreground">
              Este texto aparece para o cliente no lugar de “Outro”. Diga do que
              se trata.
            </p>
          </div>
        ) : null}

        {precisaCompetencia ? (
          <div className="space-y-1.5">
            <Label htmlFor="competencia">
              {isFolha ? "Competência da folha (mês/ano)" : "Competência (mês/ano)"}
            </Label>
            <CompetenciaInput
              key={categoria}
              id="competencia"
              name="competencia"
              required
              onValueChange={(v) => {
                setCompetencia(v);
                resetMode();
              }}
            />
          </div>
        ) : null}

        {isBoleto ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <CurrencyInput id="amount" name="amount" placeholder="1.240,00" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due_date">Data de vencimento</Label>
              <Input id="due_date" name="due_date" type="date" required />
            </div>

            {mostraFaturamento ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="faturamento">
                  Faturamento do mês (R$){" "}
                  <span className="text-muted-foreground">— opcional</span>
                </Label>
                <CurrencyInput
                  key={categoria}
                  id="faturamento"
                  name="faturamento"
                  placeholder="50.000,00"
                  onValueChange={(v) => {
                    setFaturamento(v);
                    resetMode();
                  }}
                />
                <input
                  type="hidden"
                  name="faturamento_mode"
                  ref={modeRef}
                  defaultValue="replace"
                />
                <p className="text-xs text-muted-foreground">
                  Faturamento bruto da empresa nesta competência. Alimenta o
                  dashboard de faturamento × carga tributária.
                </p>
              </div>
            ) : null}

            {hasDuplicate ? (
              <Alert className="sm:col-span-2">
                <Info />
                <AlertTitle>Faturamento deste mês já foi informado</AlertTitle>
                <AlertDescription>
                  {normalizeCompetencia(competencia)} deste cliente já tem{" "}
                  <strong className="text-foreground">
                    {formatCurrency(existing ?? 0)}
                  </strong>{" "}
                  lançado. Ao publicar, você escolhe se quer substituir, somar ou
                  manter o valor atual.
                </AlertDescription>
              </Alert>
            ) : null}

            <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
              <input
                type="checkbox"
                name="exige_comprovante"
                value="1"
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-sm">
                Exigir comprovante para o cliente marcar como pago
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Com isso ligado, o cliente só consegue quitar este boleto
                  anexando o comprovante. Você (contador) pode marcar sem.
                </span>
              </span>
            </label>
          </>
        ) : (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {isFolha
              ? "A folha não tem valor nem vencimento — informe a competência (mês) e anexe o PDF."
              : "Documentos da empresa não têm valor, vencimento nem competência — é só anexar o PDF."}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="file">
          {isBoleto
            ? "Arquivo do boleto"
            : isFolha
              ? "Arquivos da folha"
              : "Arquivo do documento"}
        </Label>
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <UploadCloud className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {isFolha
              ? "Selecione um ou vários PDFs da folha (folha, recibo, frequência...) — até 10MB cada"
              : `Selecione o PDF ${isBoleto ? "do boleto" : "do documento"} (até 10MB)`}
          </p>
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            required
            multiple={isFolha}
            className="mx-auto mt-3 max-w-xs"
          />
          {isFolha ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Dica: segure Ctrl (ou Cmd) para escolher vários arquivos de uma
              vez. Eles ficam agrupados nesta competência.
            </p>
          ) : null}
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type={hasDuplicate ? "button" : "submit"}
          disabled={pending}
          onClick={hasDuplicate ? () => setConfirmOpen(true) : undefined}
        >
          {pending ? "Enviando..." : "Publicar para o cliente"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Faturamento já informado neste mês</DialogTitle>
            <DialogDescription>
              {existing != null ? (
                <>
                  O faturamento de{" "}
                  <strong className="text-foreground">
                    {normalizeCompetencia(competencia)}
                  </strong>{" "}
                  deste cliente já é{" "}
                  <strong className="text-foreground">
                    {formatCurrency(existing)}
                  </strong>
                  . Você está lançando{" "}
                  <strong className="text-foreground">
                    {formatCurrency(novo)}
                  </strong>
                  . O que deseja fazer?
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => submitWithMode("replace")}>
              Substituir pelo novo — {formatCurrency(novo)}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitWithMode("add")}
            >
              Somar ao atual — total {formatCurrency((existing ?? 0) + novo)}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitWithMode("skip")}
            >
              Não lançar — manter {formatCurrency(existing ?? 0)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
