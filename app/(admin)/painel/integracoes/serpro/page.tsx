import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SerproDiagnostico } from "@/components/serpro-diagnostico";
import { requireAdmin } from "@/lib/auth";
import { serproConfigurado } from "@/lib/serpro/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

/**
 * Ferramenta de diagnóstico da integração SERPRO (Integra Contador). Página só do
 * contador (admin), escondida do menu. Serve para validar a integração em passos
 * seguros ANTES de qualquer automação: testar a conexão e fazer uma consulta de
 * leitura em um cliente. Nada aqui emite guia nem altera dados.
 */
export default async function SerproIntegracaoPage() {
  await requireAdmin();
  const configurado = serproConfigurado();

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("active", true)
    .order("razao_social");
  const companies = ((data ?? []) as Company[]).filter((c) => c.cnpj);

  return (
    <>
      <PageHeader
        title="Integração Receita (SERPRO)"
        subtitle="Diagnóstico do Integra Contador — testes seguros, sem emitir nada"
      />
      <div className="space-y-6 p-6">
        {!configurado ? (
          <Card className="border-amber-300 bg-amber-50 px-5 py-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Credenciais ainda não configuradas
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Defina as variáveis de ambiente abaixo (no{" "}
              <code>.env.local</code> e na Vercel) para ativar a integração:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-300">
              <li>
                <code>SERPRO_CONSUMER_KEY</code> e{" "}
                <code>SERPRO_CONSUMER_SECRET</code>
              </li>
              <li>
                <code>SERPRO_CERT_PEM_BASE64</code> (certificado em PEM/base64)
              </li>
              <li>
                <code>SERPRO_KEY_PEM_BASE64</code> (chave privada em PEM/base64)
              </li>
              <li>
                <code>SERPRO_CONTRATANTE_CNPJ</code> (CNPJ da SJ Contabilidade)
              </li>
            </ul>
          </Card>
        ) : null}

        <SerproDiagnostico
          configurado={configurado}
          companies={companies.map((c) => ({
            id: c.id,
            label: c.nome_fantasia || c.razao_social,
            cnpj: c.cnpj,
          }))}
        />
      </div>
    </>
  );
}
