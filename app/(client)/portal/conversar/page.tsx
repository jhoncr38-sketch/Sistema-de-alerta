import { redirect } from "next/navigation";
import { ConversarEmpresa } from "@/components/conversar-empresa";
import { PageHeader } from "@/components/page-header";
import { getBoasVindas } from "@/lib/ai/boas-vindas";
import { requireClient } from "@/lib/auth";
import { getClientCompanyContext } from "@/lib/companies";

export const dynamic = "force-dynamic";

/**
 * Aba "Converse com sua empresa" — central inteligente de conversa do cliente.
 * Disponível só quando o contador liga a aba para a empresa (chat_enabled).
 * As boas-vindas (saudação + achados do dia) são montadas no servidor para o
 * chat nunca abrir vazio.
 */
export default async function ConversarPage() {
  await requireClient();
  const { active } = await getClientCompanyContext();

  // Aba desligada (ou sem empresa): não existe para esta empresa — volta ao início.
  if (!active || active.chat_enabled === false) {
    redirect("/portal");
  }

  const companyName = active.nome_fantasia || active.razao_social || "sua empresa";
  const rewardsEnabled = active.rewards_enabled !== false;
  const boasVindas = await getBoasVindas(active.id, companyName, rewardsEnabled);

  return (
    // Altura fixa da viewport (descontando a barra do mobile) para o chat ter
    // um rodapé fixo e uma área de conversa que rola por dentro.
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-dvh">
      <PageHeader
        title="Converse com sua empresa"
        subtitle="Central inteligente de dúvidas"
      />
      <ConversarEmpresa boasVindas={boasVindas} />
    </div>
  );
}
