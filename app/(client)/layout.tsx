import { AppSidebar } from "@/components/app-sidebar";
import { AssistentePortal } from "@/components/assistente-portal";
import { SiteFooter } from "@/components/site-footer";
import { requireClient } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getClientCompanyContext } from "@/lib/companies";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ profile }, branding, { companies, active }] = await Promise.all([
    requireClient(),
    getBranding(),
    getClientCompanyContext(),
  ]);

  // Com 2+ empresas, o nome da empresa fica no seletor e o rodapé mostra a
  // pessoa; com 1 empresa, mantém o nome/CNPJ da empresa no rodapé.
  const multi = companies.length >= 2;
  const userName = multi
    ? profile.name
    : active?.nome_fantasia || active?.razao_social || profile.name;
  const roleLabel = multi
    ? "Cliente"
    : active?.cnpj
      ? `CNPJ ${active.cnpj}`
      : "Cliente";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        role="client"
        userName={userName}
        roleLabel={roleLabel}
        brandSubtitle="Área do Cliente"
        brandName={branding.name}
        brandLogoUrl={branding.logoUrl}
        companies={companies}
        activeCompanyId={active?.id ?? null}
        rewardsEnabled={active?.rewards_enabled !== false}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        {children}
        <SiteFooter />
      </div>
      {/* Botão flutuante do assistente em todas as telas do portal, com o
          contexto da tela atual (detectado pela URL). */}
      <AssistentePortal />
    </div>
  );
}
