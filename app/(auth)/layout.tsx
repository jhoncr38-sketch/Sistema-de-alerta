import { TriangleAlert } from "lucide-react";
import { Brand } from "@/components/brand";
import { getBranding } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = isSupabaseConfigured();
  const branding = configured
    ? await getBranding()
    : { name: null, logoUrl: null };
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Brand size="lg" name={branding.name} logoUrl={branding.logoUrl} />
        </div>
        {!configured ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Supabase não configurado. Preencha <code>contalert/.env.local</code>{" "}
              com a URL e as chaves do seu projeto e reinicie o servidor.
            </span>
          </div>
        ) : null}
        <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
