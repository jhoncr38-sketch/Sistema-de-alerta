"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateCompany } from "@/app/(admin)/painel/clientes/actions";
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
import { CnpjInput } from "@/components/masked-inputs";
import type { Company } from "@/lib/types";

export function EditCompanyButton({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateCompany({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Empresa atualizada.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Editar empresa"
        title="Editar empresa"
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>
              Atualize os dados cadastrais desta empresa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="hidden" name="id" value={company.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`razao-${company.id}`}>Razão social *</Label>
              <Input
                id={`razao-${company.id}`}
                name="razao_social"
                required
                defaultValue={company.razao_social}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`fantasia-${company.id}`}>Nome fantasia</Label>
                <Input
                  id={`fantasia-${company.id}`}
                  name="nome_fantasia"
                  defaultValue={company.nome_fantasia ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cnpj-${company.id}`}>CNPJ *</Label>
                <CnpjInput
                  id={`cnpj-${company.id}`}
                  name="cnpj"
                  required
                  defaultValue={company.cnpj}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`email-${company.id}`}>E-mail</Label>
                <Input
                  id={`email-${company.id}`}
                  name="email"
                  type="email"
                  defaultValue={company.email ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`phone-${company.id}`}>Telefone</Label>
                <Input
                  id={`phone-${company.id}`}
                  name="phone"
                  defaultValue={company.phone ?? ""}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
