import { AppSidebar } from "@/components/app-sidebar";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        role="admin"
        userName={profile.name}
        roleLabel="Contador"
        brandSubtitle="Gestão Contábil"
      />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">{children}</div>
    </div>
  );
}
