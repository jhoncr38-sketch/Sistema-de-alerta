"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePassword } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Form de "alterar senha" para o usuário logado (portal do cliente e painel do
 * contador). Limpa os campos ao salvar e mostra o resultado num toast.
 */
export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await changePassword({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Senha salva com sucesso.");
      form.reset();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={6}
          required
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          minLength={6}
          required
          autoComplete="new-password"
          placeholder="Repita a senha"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  );
}
