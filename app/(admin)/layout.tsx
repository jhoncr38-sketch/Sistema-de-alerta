import { AppSidebar } from "@/components/app-sidebar";
import { AssistenteChat } from "@/components/assistente-chat";
import { SiteFooter } from "@/components/site-footer";
import { requireAdmin } from "@/lib/auth";
import { getBranding } from "@/lib/branding";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ profile }, branding] = await Promise.all([
    requireAdmin(),
    getBranding(),
  ]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        role="admin"
        userName={profile.name}
        roleLabel="Contador"
        brandSubtitle="Gestão Contábil"
        brandName={branding.name}
        brandLogoUrl={branding.logoUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        {children}
        <SiteFooter />
      </div>
      <AssistenteChat scope="contador" />
    </div>
  );
}
