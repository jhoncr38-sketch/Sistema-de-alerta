"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createClientUser } from "@/app/(admin)/painel/clientes/actions";
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

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Cadastra a CONTA de um cliente novo direto pelo painel (sem depender do
 * autocadastro). A conta nasce sem senha (login por magic link); com a caixa
 * marcada, o convite de acesso já sai por e-mail no mesmo passo.
 */
export function NewClientButton({
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
      const res = await createClientUser({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.invited) {
        toast.success("Cliente cadastrado e convite de acesso enviado. ✅");
      } else if (res.inviteError) {
        toast.success("Cliente cadastrado.");
        toast.warning(`Cadastro criado, mas o convite falhou: ${res.inviteError}`);
      } else {
        toast.success("Cliente cadastrado. Use “Convidar” para dar acesso.");
      }
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
        <UserPlus />
        Cadastrar cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar cliente</DialogTitle>
            <DialogDescription>
              Cria a conta do cliente sem senha — ele entra pelo convite (magic
              link), com 1 toque. Não precisa que ele se cadastre sozinho.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" name="name" required placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="cliente@empresa.com.br"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyId">Empresa que pode ver *</Label>
              <select id="companyId" name="companyId" className={selectClass} required defaultValue="">
                <option value="" disabled>
                  Selecione a empresa...
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Você pode liberar mais empresas depois, em “Editar”.
              </p>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
              <input
                type="checkbox"
                name="invite"
                value="1"
                defaultChecked
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-sm">
                Enviar o convite de acesso por e-mail agora
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Manda o link de login sem senha na hora. Desmarque para convidar
                  depois (por e-mail ou WhatsApp) na lista.
                </span>
              </span>
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Cadastrando..." : "Cadastrar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
