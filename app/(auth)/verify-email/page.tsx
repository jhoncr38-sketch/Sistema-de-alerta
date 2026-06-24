import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <MailCheck className="size-6" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Confirme seu e-mail</h1>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de confirmação para o seu e-mail. Clique no link para
          ativar sua conta e depois faça login.
        </p>
      </div>
      <Button
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<Link href="/login">Ir para o login</Link>}
      />
    </div>
  );
}
