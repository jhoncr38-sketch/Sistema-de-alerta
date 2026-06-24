"use client";

import { useActionState } from "react";
import { register, type AuthState } from "./actions";
import { AuthTabs } from "@/components/auth-tabs";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authInputClass = "h-10 bg-primary/5";

export default function RegisterPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    register,
    {},
  );

  return (
    <div className="space-y-5">
      <AuthTabs />

      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Crie sua conta</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre-se para acessar seus boletos e documentos
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            name="name"
            required
            autoComplete="name"
            placeholder="Seu nome"
            className={authInputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            className={authInputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            className={authInputClass}
          />
        </div>

        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Cadastrando..." : "Cadastrar"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Após o cadastro, seu contador libera o acesso e vincula sua empresa.
      </p>
    </div>
  );
}
