"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { redeemReward } from "@/app/(client)/portal/rewards/actions";
import { Achievements } from "@/components/rewards/achievements";
import { EarnRail } from "@/components/rewards/earn-rail";
import { HistoryList } from "@/components/rewards/history-list";
import { LevelHero } from "@/components/rewards/level-hero";
import { MissionCard } from "@/components/rewards/mission-card";
import { PersonalRanking } from "@/components/rewards/personal-ranking";
import { SectionHeading } from "@/components/rewards/parts";
import { RewardStore } from "@/components/rewards/reward-store";
import { StatsGrid } from "@/components/rewards/stats-grid";
import { StreakCard } from "@/components/rewards/streak-card";
import { SurpriseBox } from "@/components/rewards/surprise-box";
import {
  allMonthlyMissionsDone,
  type LedgerEntry,
  type Reward,
  type RewardsState,
} from "@/lib/rewards";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now());
}

/**
 * Casca interativa do SJ Rewards. Mantém saldo e extrato em estado local para dar
 * feedback imediato (otimista) e chama as server actions para persistir no
 * Supabase, reconciliando com o saldo autoritativo do servidor. Se o SJ Rewards
 * ainda não foi migrado no banco, cai em "modo demonstração" (só na sessão).
 */
export function RewardsView({
  initialState,
  companyId,
}: {
  initialState: RewardsState;
  companyId: string | null;
}) {
  const [coins, setCoins] = useState(initialState.coins);
  const [history, setHistory] = useState<LedgerEntry[]>(initialState.history);
  const [redeemed, setRedeemed] = useState(initialState.rewardsRedeemed);
  const extratoRef = useRef<HTMLDivElement>(null);

  const missionsDone = allMonthlyMissionsDone(initialState.missions);

  async function handleRedeem(reward: Reward) {
    if (coins < reward.cost) return;

    // Otimista: já reflete na tela.
    const entryId = newId();
    setCoins((c) => c - reward.cost);
    setRedeemed((n) => n + 1);
    setHistory((h) => [
      {
        id: entryId,
        date: today(),
        label: `Resgate: ${reward.name}`,
        icon: reward.icon,
        coins: -reward.cost,
        xp: 0,
      },
      ...h,
    ]);

    // Sem empresa ativa (estado raro): mantém só em modo demonstração.
    if (!companyId) {
      toast.success("Resgate registrado (demonstração).", {
        description: reward.name,
      });
      return;
    }

    const res = await redeemReward(companyId, reward.id);
    if (res.ok) {
      if (typeof res.balance === "number") setCoins(res.balance);
      toast.success("Resgate confirmado!", {
        description: `${reward.name} — nossa equipe entra em contato para combinar a entrega.`,
      });
    } else if (res.reason === "not_migrated") {
      toast.success("Resgate registrado (demonstração).", {
        description: `${reward.name} — ative o SJ Rewards no banco para persistir.`,
      });
    } else {
      // Falha real → desfaz o otimismo.
      setCoins((c) => c + reward.cost);
      setRedeemed((n) => Math.max(0, n - 1));
      setHistory((h) => h.filter((e) => e.id !== entryId));
      toast.error("Não foi possível resgatar", {
        description:
          res.reason === "insufficient"
            ? "Saldo insuficiente."
            : res.reason === "forbidden"
              ? "Você não tem acesso a esta empresa."
              : "Tente novamente em instantes.",
      });
    }
  }

  function handleSurprise(bonus: number) {
    setCoins((c) => c + bonus);
    setHistory((h) => [
      {
        id: newId(),
        date: today(),
        label: "Caixa surpresa do mês",
        icon: "gift",
        coins: bonus,
        xp: 0,
      },
      ...h,
    ]);
  }

  function scrollToExtrato() {
    extratoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <LevelHero
        name={initialState.name}
        coins={coins}
        xp={initialState.xp}
        onOpenHistory={scrollToExtrato}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {initialState.missions.map((m) => (
            <MissionCard key={m.id} mission={m} href="/portal/solicitacoes" />
          ))}
        </div>
        <StreakCard days={initialState.streakDays} />
      </div>

      <section className="space-y-3">
        <SectionHeading title="Seu painel" />
        <StatsGrid coins={coins} redeemed={redeemed} state={initialState} />
      </section>

      <SurpriseBox unlocked={missionsDone} onReveal={handleSurprise} />

      <section className="space-y-3">
        <SectionHeading title="Como ganhar SJ Coins" />
        <EarnRail rules={initialState.earnRules} />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Loja de recompensas" />
        <RewardStore
          coins={coins}
          xp={initialState.xp}
          rewards={initialState.rewards}
          onRedeem={handleRedeem}
        />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Suas conquistas" />
        <Achievements items={initialState.achievements} />
      </section>

      {initialState.ranking.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="Sua evolução" />
          <PersonalRanking stats={initialState.ranking} />
        </section>
      ) : null}

      <section ref={extratoRef} className="scroll-mt-6 space-y-3">
        <SectionHeading title="Histórico" />
        <HistoryList entries={history} />
      </section>
    </div>
  );
}
