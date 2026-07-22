import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PageHeader } from "@/components/page-header";
import { getUserAndProfile } from "@/lib/auth";

export default async function ContaPage() {
  const { user, profile } = await getUserAndProfile();

  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seus dados de acesso" />
      <div className="space-y-6 p-6">
        <Card className="max-w-xl gap-4 px-6 py-6">
          <div>
            <div className="text-xs text-muted-foreground">Nome</div>
            <div className="text-sm font-medium">{profile?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">E-mail</div>
            <div className="text-sm">{user?.email ?? "—"}</div>
          </div>
        </Card>

        <Card className="max-w-xl gap-4 px-6 py-6">
          <div>
            <h2 className="text-sm font-semibold">Senha</h2>
            <p className="text-xs text-muted-foreground">
              Defina ou altere sua senha. Entrou pelo link de acesso (sem senha)?
              Aqui você cria uma — depois pode entrar por e-mail e senha também.
            </p>
          </div>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
