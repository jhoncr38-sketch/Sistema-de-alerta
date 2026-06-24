"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "./actions";
import { AuthTabs } from "@/components/auth-tabs";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authInputClass = "h-10 bg-primary/5";

function LoginNotice() {
  const params = useSearchParams();
  if (params.get("reset") === "ok") {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        Senha redefinida com sucesso. Faça login.
      </p>
    );
  }
  if (params.get("expirou") === "1") {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Sua sessão expirou. Por segurança, faça login novamente.
      </p>
    );
  }
  return null;
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    login,
    {},
  );

  return (
    <div className="space-y-5">
      <AuthTabs />

      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Bem-vindo!</h1>
        <p className="text-sm text-muted-foreground">
          Preencha seus dados para entrar
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginNotice />
      </Suspense>

      <form action={action} className="space-y-4">
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
            autoComplete="current-password"
            className={authInputClass}
          />
        </div>

        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button type="submit" size="lg" className="px-8" disabled={pending}>
            {pending ? "Entrando..." : "Entrar"}
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            Recuperar senha
          </Link>
        </div>
      </form>
    </div>
  );
}
