"use client";

import { useState, useTransition } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { createAviso } from "@/app/actions/avisos";
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

const fieldClass =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Envia um aviso/comunicado ao cliente (aparece no portal dele; opcionalmente
 * por e-mail). Empresa específica ou "Todas as empresas".
 */
export function NewAvisoButton({
  companies,
}: {
  companies: { id: string; label: string }[];
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
      const res = await createAviso({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Aviso enviado ao cliente. 📢");
      form.reset();
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Megaphone />
        Enviar aviso
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar aviso</DialogTitle>
            <DialogDescription>
              Um recado que aparece no portal do cliente. Sem pedir arquivo — só
              comunicar.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aviso_company">Para *</Label>
              <select
                id="aviso_company"
                name="company_id"
                className={fieldClass}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Selecione...
                </option>
                <option value="all">Todas as empresas</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aviso_title">Título *</Label>
              <Input
                id="aviso_title"
                name="title"
                required
                maxLength={120}
                placeholder="Ex.: Bem-vindo ao portal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aviso_message">Mensagem *</Label>
              <textarea
                id="aviso_message"
                name="message"
                required
                rows={4}
                maxLength={1000}
                className={fieldClass}
                placeholder="Escreva o aviso para o cliente..."
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
              <input
                type="checkbox"
                name="notify"
                value="1"
                defaultChecked
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-sm">
                Avisar o cliente por e-mail
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Manda o aviso por e-mail além de mostrar no portal. Para “Todas
                  as empresas”, sai um e-mail para cada uma.
                </span>
              </span>
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Enviando..." : "Enviar aviso"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
