import { AppSidebar } from "@/components/app-sidebar";
import { requireClient } from "@/lib/auth";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireClient();
  const companyName =
    profile.company?.nome_fantasia ||
    profile.company?.razao_social ||
    profile.name;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        role="client"
        userName={companyName}
        roleLabel={
          profile.company?.cnpj ? `CNPJ ${profile.company.cnpj}` : "Cliente"
        }
        brandSubtitle="Área do Cliente"
      />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">{children}</div>
    </div>
  );
}
