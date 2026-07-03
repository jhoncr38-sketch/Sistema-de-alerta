import { Coins, Gift, Users } from "lucide-react";
import { Coin, CoinAmount } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { RedemptionActions } from "@/components/redemption-actions";
import {
  RewardsMissionsPanel,
  type AdminMission,
} from "@/components/rewards-missions-panel";
import {
  RewardsCatalogPanel,
  type AdminReward,
} from "@/components/rewards-catalog-panel";
import {
  RewardsEarnPanel,
  type AdminEarnRule,
} from "@/components/rewards-earn-panel";
import { SendCoinsButton } from "@/components/send-coins-button";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelBadge, LEVEL_VISUAL } from "@/components/rewards/level-badge";
import { formatDate } from "@/lib/format";
import { levelProgress, REWARDS, type IconKey } from "@/lib/rewards";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}
interface Account {
  company_id: string;
  coins: number;
  xp: number;
  streak_days: number;
}
interface Redemption {
  id: string;
  reward_id: string;
  cost: number;
  status: string;
  created_at: string;
  company: Company | null;
}
interface LedgerRow {
  id: string;
  label: string;
  icon: IconKey;
  coins: number;
  xp: number;
  created_at: string;
  company: Company | null;
}
interface MissionRowRaw {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  coins: number;
  xp: number;
  target: number;
  due_date: string | null;
  company_id: string | null;
}
interface MissionProgressRaw {
  mission_id: string;
  company_id: string;
  progress: number;
  completed_at: string | null;
}
interface CatalogRaw {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  cost: number;
  category: string;
  requires_level: string | null;
  active: boolean;
  sort: number;
}
interface EarnRuleRaw {
  key: string;
  label: string;
  description: string | null;
  icon: string;
  coins: number;
  xp: number;
  active: boolean;
  sort: number;
  pay_categoria: string | null;
  pay_type: string | null;
}

function companyName(c: Company | null): string {
  return c ? c.nome_fantasia || c.razao_social : "—";
}
function rewardName(id: string): string {
  return REWARDS.find((r) => r.id === id)?.name ?? id;
}

const nf = new Intl.NumberFormat("pt-BR");

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default async function AdminRewardsPage() {
  const supabase = await createClient();

  const [
    companiesRes,
    accountsRes,
    redemptionsRes,
    ledgerRes,
    missionsRes,
    missionProgressRes,
    catalogRes,
    earnRulesRes,
  ] = await Promise.all([
      supabase
        .from("companies")
        .select("id,razao_social,nome_fantasia")
        .eq("active", true)
        .order("razao_social"),
      supabase.from("rewards_accounts").select("company_id,coins,xp,streak_days"),
      supabase
        .from("rewards_redemptions")
        .select("id,reward_id,cost,status,created_at, company:companies(id,razao_social,nome_fantasia)")
        .order("created_at", { ascending: false }),
      supabase
        .from("rewards_ledger")
        .select("id,label,icon,coins,xp,created_at, company:companies(id,razao_social,nome_fantasia)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("rewards_missions")
        .select("id,title,description,icon,coins,xp,target,due_date,company_id")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("rewards_mission_progress")
        .select("mission_id,company_id,progress,completed_at"),
      supabase
        .from("rewards_catalog")
        .select("id,name,description,icon,cost,category,requires_level,active,sort")
        .order("sort", { ascending: true }),
      supabase
        .from("rewards_earn_rules")
        .select("key,label,description,icon,coins,xp,active,sort,pay_categoria,pay_type")
        .order("sort", { ascending: true }),
    ]);

  const companies = (companiesRes.data ?? []) as Company[];
  const accounts = (accountsRes.data ?? []) as Account[];
  const redemptions = (redemptionsRes.data ?? []) as unknown as Redemption[];
  const ledger = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const missionsRaw = (missionsRes.data ?? []) as MissionRowRaw[];
  const missionProgressRaw = (missionProgressRes.data ?? []) as MissionProgressRaw[];

  const accountByCompany = new Map(accounts.map((a) => [a.company_id, a]));
  const rows = companies
    .map((c) => ({ company: c, account: accountByCompany.get(c.id) }))
    .sort((a, b) => (b.account?.coins ?? 0) - (a.account?.coins ?? 0));

  const totalCoins = accounts.reduce((s, a) => s + (a.coins ?? 0), 0);
  const engaged = accounts.filter((a) => (a.coins ?? 0) + (a.xp ?? 0) > 0).length;
  const pendingRedemptions = redemptions.filter(
    (r) => r.status === "pending",
  ).length;

  // Dados para o painel de missões (serializáveis para o client component).
  const missionCompanies = companies.map((c) => ({
    id: c.id,
    name: companyName(c),
  }));
  const missionsData: AdminMission[] = missionsRaw.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    icon: m.icon,
    coins: m.coins,
    xp: m.xp,
    target: m.target,
    dueDate: m.due_date,
    companyId: m.company_id,
  }));
  const missionProgress: Record<
    string,
    { progress: number; completed: boolean }
  > = {};
  for (const p of missionProgressRaw) {
    missionProgress[`${p.mission_id}:${p.company_id}`] = {
      progress: p.progress,
      completed: p.completed_at != null,
    };
  }

  // Catálogo da loja (para a aba Recompensas e para nomear resgates).
  const catalogRaw = (catalogRes.data ?? []) as CatalogRaw[];
  const catalog: AdminReward[] = catalogRaw.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    icon: r.icon,
    cost: r.cost,
    category: r.category,
    requiresLevel: r.requires_level,
    active: r.active,
  }));
  const rewardNameById = new Map(catalog.map((r) => [r.id, r.name]));
  const resolveRewardName = (id: string) =>
    rewardNameById.get(id) ?? rewardName(id);

  // Boas ações ("Como ganhar SJ Coins").
  const earnRulesRaw = (earnRulesRes.data ?? []) as EarnRuleRaw[];
  const earnRules: AdminEarnRule[] = earnRulesRaw.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description ?? "",
    icon: r.icon,
    coins: r.coins,
    xp: r.xp,
    active: r.active,
    payCategoria: r.pay_categoria,
    payType: r.pay_type,
  }));

  return (
    <>
      <PageHeader title="SJ Rewards" subtitle="Console do Clube SJ">
        <SendCoinsButton companies={companies} />
      </PageHeader>

      <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="SJ Coins em circulação"
            value={
              <span className="inline-flex items-center gap-1.5">
                {nf.format(totalCoins)} <Coin className="text-base" />
              </span>
            }
            icon={<Coins />}
          />
          <StatTile
            label="Empresas no clube"
            value={nf.format(engaged)}
            icon={<Users />}
          />
          <StatTile
            label="Resgates a entregar"
            value={nf.format(pendingRedemptions)}
            icon={<Gift />}
          />
        </div>

        <Tabs defaultValue="acompanhamento">
          <TabsList>
            <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
            <TabsTrigger value="missoes">
              Missões
              {missionsData.length > 0 ? ` (${missionsData.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="recompensas">Recompensas</TabsTrigger>
            <TabsTrigger value="boas-acoes">Boas ações</TabsTrigger>
            <TabsTrigger value="resgates">
              Resgates
              {pendingRedemptions > 0 ? ` (${pendingRedemptions})` : ""}
            </TabsTrigger>
            <TabsTrigger value="extrato">Extrato</TabsTrigger>
          </TabsList>

          {/* ---- Acompanhamento ---- */}
          <TabsContent value="acompanhamento">
            <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Rumo ao próximo nível</TableHead>
                    <TableHead className="text-right">SJ Coins</TableHead>
                    <TableHead className="text-right">XP</TableHead>
                    <TableHead className="text-right">Sequência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ company, account }) => {
                    const { current, next, pct, xpRemaining } = levelProgress(
                      account?.xp ?? 0,
                    );
                    return (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">
                          {companyName(company)}
                        </TableCell>
                        <TableCell>
                          <LevelBadge
                            accent={current.accent}
                            name={current.name}
                          />
                        </TableCell>
                        <TableCell>
                          {next ? (
                            <div className="flex min-w-[190px] items-center gap-2.5">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width]",
                                    LEVEL_VISUAL[current.accent].bar,
                                  )}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                faltam {nf.format(xpRemaining)} XP · {next.name}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                              Nível máximo atingido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nf.format(account?.coins ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {nf.format(account?.xp ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {account?.streak_days ?? 0} dias
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ---- Missões ---- */}
          <TabsContent value="missoes">
            <RewardsMissionsPanel
              companies={missionCompanies}
              missions={missionsData}
              progress={missionProgress}
            />
          </TabsContent>

          {/* ---- Recompensas (loja) ---- */}
          <TabsContent value="recompensas">
            <RewardsCatalogPanel rewards={catalog} />
          </TabsContent>

          {/* ---- Boas ações (Como ganhar SJ Coins) ---- */}
          <TabsContent value="boas-acoes">
            <RewardsEarnPanel rules={earnRules} />
          </TabsContent>

          {/* ---- Resgates ---- */}
          <TabsContent value="resgates">
            {redemptions.length === 0 ? (
              <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
                Nenhum resgate ainda.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Prêmio</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {companyName(r.company)}
                        </TableCell>
                        <TableCell>{resolveRewardName(r.reward_id)}</TableCell>
                        <TableCell className="text-right">
                          <CoinAmount value={r.cost} className="text-sm" />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(r.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RedemptionActions id={r.id} status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ---- Extrato global ---- */}
          <TabsContent value="extrato">
            {ledger.length === 0 ? (
              <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
                Sem movimentações ainda.
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                {ledger.map((e) => {
                  const isDebit = e.coins < 0;
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
                          isDebit
                            ? "bg-muted text-muted-foreground"
                            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
                        )}
                      >
                        <RewardIcon name={e.icon} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {companyName(e.company)} · {formatDate(e.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <CoinAmount
                          value={e.coins}
                          signed
                          className={cn(
                            "text-sm",
                            isDebit
                              ? "text-muted-foreground"
                              : "text-emerald-600 dark:text-emerald-400",
                          )}
                        />
                        {e.xp > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            +{e.xp} XP
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
