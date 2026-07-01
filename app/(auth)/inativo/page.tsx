import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InativoPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <Ban className="size-6" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Acesso desativado</h1>
        <p className="text-sm text-muted-foreground">
          Seu acesso ao portal foi desativado pelo seu contador. Entre em
          contato com ele para reativar a sua conta.
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
