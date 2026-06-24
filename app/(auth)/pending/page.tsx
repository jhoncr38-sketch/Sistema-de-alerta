import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Clock className="size-6" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Cadastro em análise</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta foi criada e está aguardando a liberação do seu contador.
          Assim que ele vincular sua empresa, você poderá acessar seus boletos.
        </p>
      </div>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline" className="w-full">
          Sair
        </Button>
      </form>
    </div>
  );
}
