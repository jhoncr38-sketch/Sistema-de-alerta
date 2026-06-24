import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getUserAndProfile } from "@/lib/auth";

export default async function ConfiguracoesPage() {
  const { user, profile } = await getUserAndProfile();

  return (
    <>
      <PageHeader title="Configurações" subtitle="Sua conta" />
      <div className="p-6">
        <Card className="max-w-xl gap-4 px-6 py-6">
          <div>
            <div className="text-xs text-muted-foreground">Nome</div>
            <div className="text-sm font-medium">{profile?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">E-mail</div>
            <div className="text-sm">{user?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Perfil</div>
            <div className="text-sm">Contador (administrador)</div>
          </div>
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Os alertas de vencimento por e-mail são enviados automaticamente
            todos os dias. Configure o remetente e a chave do Resend nas
            variáveis de ambiente.
          </p>
        </Card>
      </div>
    </>
  );
}
