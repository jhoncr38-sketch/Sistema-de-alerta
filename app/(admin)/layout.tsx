import { AppSidebar } from "@/components/app-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { requireAdmin } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [{ profile }, branding, { count: pedidos2via }, { count: aConfirmar }] =
    await Promise.all([
      requireAdmin(),
      getBranding(),
      // Tarefas do contador (badge do Dashboard): 2ª via pedida + pagamento
      // informado pelo cliente esperando confirmação.
      supabase
        .from("boleto_reissue_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "aguardando"),
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
        tarefasPendentes={(pedidos2via ?? 0) + (aConfirmar ?? 0)}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
