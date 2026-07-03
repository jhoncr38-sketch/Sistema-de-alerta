"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createDocumentRequest } from "@/app/actions/document-requests";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompetenciaInput } from "@/components/masked-inputs";

interface CompanyOption {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function NewDocumentRequestButton({
  companies,
}: {
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await createDocumentRequest({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Solicitação criada.");
      form.reset();
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Solicitar documento
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar documento</DialogTitle>
            <DialogDescription>
              Peça um documento à empresa. Ela recebe a solicitação no portal e
              envia o arquivo por lá.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="company_id">Empresa *</Label>
              <select
                id="company_id"
                name="company_id"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>
                  Selecione a empresa
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Documento pedido *</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="Ex.: Nota fiscal de junho, extrato bancário..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Instruções (opcional)</Label>
              <Input
                id="description"
                name="description"
                placeholder="Detalhes ou orientações para o cliente"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="competencia">Competência (opcional)</Label>
                <CompetenciaInput id="competencia" name="competencia" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due_date">Prazo (opcional)</Label>
                <Input id="due_date" name="due_date" type="date" />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Criando..." : "Solicitar documento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
