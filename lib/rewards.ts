// Domínio do SJ Rewards — o "Clube SJ" de fidelidade da S J Contabilidade.
//
// Duas moedas independentes, no mesmo espírito de um app bancário:
//   • SJ Coins — saldo gastável. Sobe com boas ações, cai ao resgatar prêmios.
//   • XP        — pontuação permanente (nunca gasta). Só serve para subir de nível.
//
// Tudo aqui é dado + função pura: adicionar uma missão, um nível ou um prêmio
// é acrescentar um objeto num array. A lógica (nível a partir do XP, progresso,
// multiplicador de sequência) não conhece a origem dos dados — hoje vem do mock
// `getMockRewardsState()`, amanhã de tabelas no Supabase, sem mudar a UI.

/** Chaves de ícone (mapeadas para componentes lucide no cliente, ver icon-registry). */
export type IconKey =
  | "file-check"
  | "dollar"
  | "calendar-check"
  | "user-edit"
  | "survey"
  | "smartphone"
  | "video"
  | "target"
  | "shield-check"
  | "star"
  | "gift"
  | "certificate"
  | "consulting"
  | "diagnosis"
  | "ebook"
  | "mug"
  | "discount"
  | "priority"
  | "trophy"
  | "crown"
  | "medal"
  | "flame"
  | "sparkles"
  | "rocket"
  | "building"
  | "trending-up"
  | "trending-down"
  | "refresh";

// ─────────────────────────────────────────────────────────────────────────────
// Níveis
// ─────────────────────────────────────────────────────────────────────────────

export type LevelId =
  | "bronze"
  | "prata"
  | "ouro"
  | "diamante"
  | "master"
  | "elite";

export interface Level {
  id: LevelId;
  name: string;
  /** XP mínimo para entrar no nível (crescente). */
  minXp: number;
  /** Vantagens exclusivas desbloqueadas ao atingir o nível. */
  perks: string[];
  /** Cor de realce (usada no anel/badge). Chave semântica, resolvida na UI. */
  accent: "bronze" | "prata" | "ouro" | "diamante" | "master" | "elite";
}

/** Trilha de níveis, do mais baixo ao mais alto. Editar aqui para recalibrar. */
export const LEVELS: Level[] = [
  {
    id: "bronze",
    name: "Bronze",
    minXp: 0,
    accent: "bronze",
    perks: ["Acesso ao Clube SJ", "Missão do mês"],
  },
  {
    id: "prata",
    name: "Prata",
    minXp: 1000,
    accent: "prata",
    perks: ["Lembretes de vencimento por push", "Loja de recompensas"],
  },
  {
    id: "ouro",
    name: "Ouro",
    minXp: 3000,
    accent: "ouro",
    perks: ["Certidões gratuitas no mês", "Fila prioritária no atendimento"],
  },
  {
    id: "diamante",
    name: "Diamante",
    minXp: 7000,
    accent: "diamante",
    perks: ["Diagnóstico financeiro trimestral", "Bônus de 10% em SJ Coins"],
  },
  {
    id: "master",
    name: "Master",
    minXp: 15000,
    accent: "master",
    perks: [
      "Bônus de 15% em SJ Coins",
      "Consultoria mensal inclusa",
      "Gerente de conta dedicado",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    minXp: 30000,
    accent: "elite",
    perks: [
      "Bônus de 20% em SJ Coins",
      "Condições exclusivas em serviços",
      "Convites para eventos SJ",
    ],
  },
];

/** Nível atual a partir do XP acumulado. */
export function levelForXp(xp: number): Level {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (xp >= level.minXp) current = level;
    else break;
  }
  return current;
}

/** Próximo nível na trilha, ou null se já está no topo (Elite). */
export function nextLevel(level: Level): Level | null {
  const idx = LEVELS.findIndex((l) => l.id === level.id);
  return LEVELS[idx + 1] ?? null;
}

/** Posição do nível na trilha (0 = Bronze). */
export function levelIndex(id: LevelId): number {
  return LEVELS.findIndex((l) => l.id === id);
}

/** Verdadeiro se o XP atual já alcança (ou supera) o nível exigido. */
export function meetsLevel(xp: number, required: LevelId): boolean {
  return levelIndex(levelForXp(xp).id) >= levelIndex(required);
}

export interface LevelProgress {
  current: Level;
  next: Level | null;
  /** 0–100. No nível máximo, sempre 100. */
  pct: number;
  /** XP acumulado dentro do nível atual. */
  xpIntoLevel: number;
  /** XP total necessário para ir do nível atual ao próximo. */
  xpForNext: number;
  /** Quanto ainda falta para o próximo nível (0 no topo). */
  xpRemaining: number;
}

/** Progresso do XP dentro do nível atual — alimenta o anel do card principal. */
export function levelProgress(xp: number): LevelProgress {
  const current = levelForXp(xp);
  const next = nextLevel(current);
  if (!next) {
    return {
      current,
      next: null,
      pct: 100,
      xpIntoLevel: xp - current.minXp,
      xpForNext: 0,
      xpRemaining: 0,
    };
  }
  const xpForNext = next.minXp - current.minXp;
  const xpIntoLevel = xp - current.minXp;
  const pct = Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100)));
  return {
    current,
    next,
    pct,
    xpIntoLevel,
    xpForNext,
    xpRemaining: next.minXp - xp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequência (streak) — dias consecutivos de acesso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multiplicador de bônus por sequência: +5% a cada 7 dias, limitado a 1,5x.
 * Ex.: 45 dias → floor(45/7)=6 → 1 + 6*0,05 = 1,30x.
 */
export function streakMultiplier(days: number): number {
  const steps = Math.floor(days / 7);
  return Math.min(1.5, 1 + steps * 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Regras de ganho (boas ações)
// ─────────────────────────────────────────────────────────────────────────────

export interface EarnRule {
  id: string;
  label: string;
  description: string;
  icon: IconKey;
  coins: number;
  xp: number;
  /** Categoria do gatilho de pagamento ('boleto'|'parcelamento'), p/ levar à aba certa. */
  payCategoria?: string | null;
}

/** Catálogo de boas ações que geram SJ Coins e XP. */
export const EARN_RULES: EarnRule[] = [
  {
    id: "doc-no-prazo",
    label: "Enviar documentos",
    description: "Antes do prazo combinado",
    icon: "file-check",
    coins: 100,
    xp: 100,
  },
  {
    id: "honorarios-em-dia",
    label: "Pagar honorários",
    description: "Em dia, sem atraso",
    icon: "dollar",
    coins: 100,
    xp: 100,
  },
  {
    id: "parcelamento-em-dia",
    label: "Pagar parcelamentos",
    description: "Parcela quitada no prazo",
    icon: "calendar-check",
    coins: 80,
    xp: 80,
  },
  {
    id: "atualizar-cadastro",
    label: "Atualizar cadastro",
    description: "Dados da empresa em dia",
    icon: "user-edit",
    coins: 50,
    xp: 40,
  },
  {
    id: "responder-pesquisa",
    label: "Responder pesquisa",
    description: "Feedback de atendimento",
    icon: "survey",
    coins: 50,
    xp: 40,
  },
  {
    id: "acessar-app",
    label: "Acessar o aplicativo",
    description: "Mantém sua sequência ativa",
    icon: "smartphone",
    coins: 20,
    xp: 20,
  },
  {
    id: "video-educativo",
    label: "Assistir vídeos",
    description: "Conteúdo educativo",
    icon: "video",
    coins: 30,
    xp: 30,
  },
  {
    id: "missao-mes",
    label: "Concluir missão do mês",
    description: "Todas as metas do mês",
    icon: "target",
    coins: 300,
    xp: 250,
  },
  {
    id: "ano-sem-atraso",
    label: "12 meses sem atraso",
    description: "Um ano exemplar",
    icon: "shield-check",
    coins: 1000,
    xp: 1200,
  },
  {
    id: "empresa-nota-10",
    label: "Empresa Nota 10",
    description: "Organização impecável",
    icon: "star",
    coins: 500,
    xp: 600,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Loja de recompensas
// ─────────────────────────────────────────────────────────────────────────────

export type RewardCategory = "servico" | "consultoria" | "brinde" | "desconto";

export interface Reward {
  id: string;
  name: string;
  description: string;
  icon: IconKey;
  /** Custo em SJ Coins. */
  cost: number;
  category: RewardCategory;
  /** Nível mínimo exigido para resgatar (opcional). */
  requiresLevel?: LevelId;
}

/** Catálogo de prêmios resgatáveis com SJ Coins. */
export const REWARDS: Reward[] = [
  {
    id: "ebook",
    name: "E-book exclusivo",
    description: "Guia de gestão financeira para o seu negócio",
    icon: "ebook",
    cost: 150,
    category: "servico",
  },
  {
    id: "certidao",
    name: "Certidão gratuita",
    description: "Emissão de uma certidão negativa sem custo",
    icon: "certificate",
    cost: 300,
    category: "servico",
  },
  {
    id: "mug",
    name: "Caneca personalizada",
    description: "Caneca premium com a marca da sua empresa",
    icon: "mug",
    cost: 500,
    category: "brinde",
  },
  {
    id: "diagnostico",
    name: "Diagnóstico financeiro",
    description: "Análise completa dos indicadores da empresa",
    icon: "diagnosis",
    cost: 600,
    category: "consultoria",
  },
  {
    id: "prioridade",
    name: "Atendimento prioritário",
    description: "Fila preferencial por 30 dias",
    icon: "priority",
    cost: 700,
    category: "servico",
    requiresLevel: "ouro",
  },
  {
    id: "consultoria",
    name: "Consultoria de 30 min",
    description: "Sessão individual com um especialista",
    icon: "consulting",
    cost: 800,
    category: "consultoria",
  },
  {
    id: "desconto",
    name: "Desconto em serviços",
    description: "Abatimento na próxima mensalidade",
    icon: "discount",
    cost: 1000,
    category: "desconto",
    requiresLevel: "diamante",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Missões
// ─────────────────────────────────────────────────────────────────────────────

export interface Mission {
  id: string;
  title: string;
  description: string;
  coins: number;
  xp: number;
  /** Progresso atual e meta (ex.: 2 de 3 documentos). */
  progress: number;
  target: number;
  /** Rótulo de prazo já formatado (ex.: "até 05/07"). */
  dueLabel?: string;
  /** Ícone opcional (missões criadas pelo contador); a UI usa clipboard por padrão. */
  icon?: IconKey;
  /** Selo exibido no card (default "Missão do mês"). Missões próprias usam "Missão". */
  tag?: string;
}

export function missionPct(m: Mission): number {
  if (m.target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((m.progress / m.target) * 100)));
}

export function missionDone(m: Mission): boolean {
  return m.progress >= m.target;
}

/**
 * Missões do mês (definição). O progresso real (quanto já foi feito) será
 * calculado a partir dos dados da empresa ao ligar no banco — hoje entra como 0.
 */
export const MONTHLY_MISSIONS: Omit<Mission, "progress">[] = [
  {
    id: "docs-ate-05",
    title: "Envie todos os documentos até o dia 05",
    description: "Notas, extratos e folha do mês dentro do prazo.",
    coins: 300,
    xp: 250,
    target: 3,
    dueLabel: "até 05/07",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Conquistas (medalhas)
// ─────────────────────────────────────────────────────────────────────────────

/** Definição de uma medalha (fica no código; o desbloqueio vem do banco). */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: IconKey;
}

export interface Achievement extends AchievementDef {
  unlocked: boolean;
  /** Data ISO de desbloqueio (quando unlocked). */
  unlockedAt?: string;
}

/** Catálogo de conquistas. O que cada empresa desbloqueou vem de rewards_achievements. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "empresa-organizada",
    name: "Empresa Organizada",
    description: "3 meses seguidos enviando tudo no prazo.",
    icon: "sparkles",
  },
  {
    id: "cliente-ouro",
    name: "Cliente Ouro",
    description: "Alcançou o nível Ouro no Clube SJ.",
    icon: "crown",
  },
  {
    id: "ano-sem-atraso",
    name: "12 meses sem atrasos",
    description: "Um ano inteiro sem nenhuma pendência vencida.",
    icon: "shield-check",
  },
  {
    id: "empresa-nota-10",
    name: "Empresa Nota 10",
    description: "Pontuação máxima de organização no mês.",
    icon: "star",
  },
  {
    id: "parceiro-premium",
    name: "Parceiro Premium",
    description: "Mais de 2 anos de parceria com a S J Contabilidade.",
    icon: "medal",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Extrato (histórico de moedas e XP)
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  /** ISO date. */
  date: string;
  label: string;
  icon: IconKey;
  /** Positivo em ganhos, negativo em resgates. */
  coins: number;
  xp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking pessoal — sempre contra o próprio histórico, nunca contra terceiros
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgressStat {
  id: string;
  label: string;
  value: string;
  detail?: string;
  /** up = evolução positiva; down = redução (ex.: menos pendências). */
  direction: "up" | "down";
  icon: IconKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado do cliente + mock
// ─────────────────────────────────────────────────────────────────────────────

export interface RewardsState {
  /** Nome exibido no card principal (empresa ou pessoa). */
  name: string;
  coins: number;
  xp: number;
  streakDays: number;
  missionsCompleted: number;
  rewardsRedeemed: number;
  goodActions: number;
  missions: Mission[];
  /** Catálogo da loja (do banco quando migrado; senão o padrão `REWARDS`). */
  rewards: Reward[];
  /** Boas ações "Como ganhar SJ Coins" (do banco quando migrado; senão `EARN_RULES`). */
  earnRules: EarnRule[];
  history: LedgerEntry[];
  achievements: Achievement[];
  ranking: ProgressStat[];
}

/** Total de missões concluídas neste mês (para desbloquear a caixa surpresa). */
export function allMonthlyMissionsDone(missions: Mission[]): boolean {
  return missions.length > 0 && missions.every(missionDone);
}

/**
 * Estado de exemplo — deixa a tela renderizando de imediato e serve de contrato
 * para a futura consulta no Supabase (mesma forma de `RewardsState`).
 *
 * Calibrado para bater com o mock visual: nível Ouro, ~82% rumo a Diamante.
 * XP 6.280 → Ouro(3.000)→Diamante(7.000): (6280-3000)/4000 = 82%.
 */
export function getMockRewardsState(name: string): RewardsState {
  // Datas de desbloqueio fictícias, por chave de conquista.
  const unlockedAt: Record<string, string> = {
    "empresa-organizada": "2026-04-30",
    "cliente-ouro": "2026-05-12",
    "empresa-nota-10": "2026-06-01",
  };
  return {
    name,
    coins: 2350,
    xp: 6280,
    streakDays: 45,
    missionsCompleted: 14,
    rewardsRedeemed: 3,
    goodActions: 128,
    missions: MONTHLY_MISSIONS.map((m) => ({
      ...m,
      progress: m.id === "docs-ate-05" ? 2 : 0,
    })),
    rewards: REWARDS,
    earnRules: EARN_RULES,
    history: [
      {
        id: "h1",
        date: "2026-06-20",
        label: "Documentos enviados dentro do prazo",
        icon: "file-check",
        coins: 100,
        xp: 100,
      },
      {
        id: "h2",
        date: "2026-06-20",
        label: "Honorários pagos em dia",
        icon: "dollar",
        coins: 100,
        xp: 100,
      },
      {
        id: "h3",
        date: "2026-06-19",
        label: "Acesso ao aplicativo",
        icon: "smartphone",
        coins: 20,
        xp: 20,
      },
      {
        id: "h4",
        date: "2026-06-18",
        label: "Avaliação de atendimento",
        icon: "survey",
        coins: 50,
        xp: 40,
      },
      {
        id: "h5",
        date: "2026-06-15",
        label: "Resgate: Certidão gratuita",
        icon: "certificate",
        coins: -300,
        xp: 0,
      },
      {
        id: "h6",
        date: "2026-06-10",
        label: "Parcela do REFIS quitada no prazo",
        icon: "calendar-check",
        coins: 80,
        xp: 80,
      },
    ],
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: a.id in unlockedAt,
      unlockedAt: unlockedAt[a.id],
    })),
    ranking: [
      {
        id: "organizacao",
        label: "Mais organizado que há 6 meses",
        value: "+23%",
        detail: "Baseado no envio de documentos no prazo",
        direction: "up",
        icon: "trending-up",
      },
      {
        id: "pendencias",
        label: "Redução de pendências",
        value: "-80%",
        detail: "Guias em atraso caíram de 10 para 2",
        direction: "down",
        icon: "trending-down",
      },
      {
        id: "xp-semestre",
        label: "XP ganho no semestre",
        value: "+1.200",
        detail: "Sua melhor marca até hoje",
        direction: "up",
        icon: "sparkles",
      },
    ],
  };
}
