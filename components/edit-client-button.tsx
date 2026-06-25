"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateClient } from "@/app/(admin)/painel/clientes/actions";
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
import type { Company, ProfileWithCompany } from "@/lib/types";

/**
 * Edita um cliente: nome e QUAIS empresas ele pode ver. Apenas o contador.
 * A primeira empresa marcada (de cima para baixo) é a padrão ao abrir o portal.
 */
export function EditClientButton({
  client,
  companies,
  linkedIds,
}: {
  client: ProfileWithCompany;
  companies: Company[];
  linkedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateClient({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Cliente atualizado.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Editar cliente"
        title="Editar cliente"
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Defina o nome e quais empresas este cliente pode ver no portal.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="userId" value={client.id} />

            <div className="space-y-1.5">
              <Label htmlFor={`name-${client.id}`}>Nome do cliente *</Label>
              <Input
                id={`name-${client.id}`}
                name="name"
                required
                defaultValue={client.name}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Empresas que pode ver</Label>
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma empresa cadastrada ainda.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
                  {companies.map((co) => (
                    <label
                      key={co.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        name="companyIds"
                        value={co.id}
                        defaultChecked={linkedIds.includes(co.id)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {co.nome_fantasia || co.razao_social}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {co.cnpj}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                A primeira marcada (de cima para baixo) é a empresa padrão ao
                abrir o portal. O cliente só alterna entre as marcadas.
              </p>
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
