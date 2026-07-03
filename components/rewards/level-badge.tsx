import {
  Award,
  Crown,
  Gem,
  Medal,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { Level } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Símbolo e cores de cada nível — fonte única usada na trilha da vitrine
 * (`rewards-locked`) e no selo/console do contador (`LevelBadge`). Prestígio
 * crescente: medalha → medalha de fita → troféu → diamante → estrela → coroa.
 */
export const LEVEL_VISUAL: Record<
  Level["accent"],
  {
    Icon: LucideIcon;
    /** Cor do ícone sobre fundo escuro (herói da vitrine). */
    onDark: string;
    /** Classes do selo (pílula) em UI clara. */
    badge: string;
    /** Cor de preenchimento da barra de progresso. */
    bar: string;
  }
> = {
  bronze: {
    Icon: Medal,
    onDark: "text-amber-600",
    badge:
      "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
    bar: "bg-amber-600",
  },
  prata: {
    Icon: Award,
    onDark: "text-slate-300",
    badge:
      "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-400/20",
    bar: "bg-slate-400",
  },
  ouro: {
    Icon: Trophy,
    onDark: "text-amber-400",
    badge:
      "bg-amber-100 text-amber-800 ring-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/25",
    bar: "bg-amber-500",
  },
  diamante: {
    Icon: Gem,
    onDark: "text-cyan-300",
    badge:
      "bg-cyan-100 text-cyan-800 ring-cyan-500/20 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-400/20",
    bar: "bg-cyan-500",
  },
  master: {
    Icon: Star,
    onDark: "text-violet-300",
    badge:
      "bg-violet-100 text-violet-800 ring-violet-500/20 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-400/20",
    bar: "bg-violet-500",
  },
  elite: {
    Icon: Crown,
    onDark: "text-fuchsia-300",
    badge:
      "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-500/20 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
    bar: "bg-fuchsia-500",
  },
};

/** Selo do nível: símbolo + nome numa pílula colorida. */
export function LevelBadge({
  accent,
  name,
  className,
}: {
  accent: Level["accent"];
  name: string;
  className?: string;
}) {
  const { Icon } = LEVEL_VISUAL[accent];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        LEVEL_VISUAL[accent].badge,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {name}
    </span>
  );
}
