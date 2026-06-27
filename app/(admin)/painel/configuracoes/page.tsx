import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { BrandSettingsForm } from "@/components/brand-settings-form";
import { TestEmailButton } from "@/components/test-email-button";
import { getUserAndProfile } from "@/lib/auth";
import { getBranding } from "@/lib/branding";

export default async function ConfiguracoesPage() {
  const [{ user, profile }, branding] = await Promise.all([
    getUserAndProfile(),
    getBranding(),
  ]);

  return (
    <>
      <PageHeader title="Configurações" subtitle="Sua conta" />
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

        <Card className="max-w-xl gap-4 px-6 py-6">
          <div>
            <h2 className="text-sm font-semibold">E-mails (Resend)</h2>
            <p className="text-xs text-muted-foreground">
              Os alertas de vencimento e os resumos são enviados por e-mail via
              Resend. Use o botão abaixo para confirmar que o envio está
              funcionando de verdade.
            </p>
          </div>

          <TestEmailButton to={user?.email ?? null} />
        </Card>

        <Card className="max-w-xl gap-4 px-6 py-6">
          <div>
            <h2 className="text-sm font-semibold">Identidade visual</h2>
            <p className="text-xs text-muted-foreground">
              Nome e logo exibidos no menu e na tela de login. Só você (contador)
              pode alterar.
            </p>
          </div>

          <BrandSettingsForm
            initialName={branding.name}
            initialLogoUrl={branding.logoUrl}
          />

          <div className="flex items-start gap-2 rounded-lg border-t bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">Tamanho e formato ideais do logo:</strong>{" "}
              imagem <strong className="text-foreground">quadrada</strong>, de{" "}
              <strong className="text-foreground">512 × 512px</strong> (mínimo 256 × 256px), em{" "}
              <strong className="text-foreground">PNG ou SVG com fundo transparente</strong>{" "}
              (JPG também funciona, mas sem transparência). Tamanho máximo: 2MB. Evite
              logos com texto muito pequeno — o ícone aparece pequeno no menu (36×36px).
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
