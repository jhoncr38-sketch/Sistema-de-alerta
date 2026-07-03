import {
  registerAccess,
  runRewardsChecks,
} from "@/app/(client)/portal/rewards/actions";
import { RewardsGuide } from "@/components/rewards/rewards-guide";
import { RewardsLocked } from "@/components/rewards/rewards-locked";
import { RewardsView } from "@/components/rewards/rewards-view";
import { PageHeader } from "@/components/page-header";
import { getUserAndProfile } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { getClientCompanyContext } from "@/lib/companies";
import { getRewardsState } from "@/lib/rewards-data";

export default async function RewardsPage() {
  const { profile } = await getUserAndProfile();
  const { active } = await getClientCompanyContext();

  // Clube desligado para esta empresa: mostra a vitrine (o que o cliente
  // ganharia + aviso de que não está ativo) em vez do clube. Tela estática:
  // não registra acesso, não avalia conquistas e não credita nada.
  if (active && active.rewards_enabled === false) {
    const branding = await getBranding();
    return (
      <>
        <PageHeader title="SJ Rewards" subtitle="Clube de Vantagens" />
        <RewardsLocked brandName={branding.name} />
      </>
    );
  }

  // Nome exibido no card principal: prioriza a empresa ativa, com o primeiro
  // nome da pessoa como reserva.
  const name =
    active?.nome_fantasia ||
    active?.razao_social ||
    profile?.name?.split(/\s+/)[0] ||
    "cliente";

  // Contabiliza o acesso do dia ANTES de ler o estado (idempotente por dia),
  // para o saldo já refletir o bônus diário e a sequência no 1º carregamento.
  // Em seguida, avalia conquistas e subida de nível (dispara avisos por e-mail).
  if (active?.id) {
    await registerAccess(active.id);
    await runRewardsChecks(active.id);
  }

  // Lê o estado real da empresa. Enquanto a migration 0018 não é aplicada,
  // getRewardsState cai no modo demonstração (mock) — o portal não quebra.
  const state = await getRewardsState(active?.id ?? null, name);

  return (
    <>
      <PageHeader title="SJ Rewards" subtitle="Clube de Vantagens">
        <RewardsGuide />
      </PageHeader>
      <RewardsView initialState={state} companyId={active?.id ?? null} />
    </>
  );
}
