import { AppSidebar } from "@/components/app-sidebar";
import { InstallAppOnboarding } from "@/components/install-app-onboarding";
import { SiteFooter } from "@/components/site-footer";
import { requireClient } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getClientCompanyContext } from "@/lib/companies";
import { createClient } from "@/lib/supabase/server";
import { getAlertasEmpresas } from "@/lib/portal-alertas";

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
  const supabase = await createClient();
  const [alertas, { count: docsPendentes }] = await Promise.all([
    getAlertasEmpresas(companies.map((c) => c.id)),
    // Pedidos de documento do contador ainda não enviados (badge do menu).
    supabase
      .from("document_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", active?.id ?? "00000000-0000-0000-0000-000000000000")
      .neq("status", "submitted"),
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
        rewardsEnabled={active?.rewards_enabled !== false}
        chatEnabled={active?.chat_enabled !== false}
        boletosVencidos={active ? (alertas[active.id]?.boletosVencidos ?? 0) : 0}
        documentosPendentes={docsPendentes ?? 0}
      />
      {/* pb no celular: espaço da barra inferior fixa (78px). */}
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30 pb-[78px] md:pb-0">
        {children}
        <SiteFooter />
      </div>
      {/* Primeiro acesso (magic link ou cadastro): convida a instalar o app. */}
      <InstallAppOnboarding />
    </div>
  );
}
