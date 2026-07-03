import {
  Award,
  BadgePercent,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  ChartColumnBig,
  ClipboardList,
  Coffee,
  Crown,
  DollarSign,
  FileBadge,
  FileCheck,
  Flame,
  Gift,
  Medal,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPen,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Mapa chave → ícone lucide. As tabelas/mock guardam só a string (serializável e
 * pronta para o banco); a UI resolve o componente aqui. Novo ícone = nova entrada.
 */
const ICONS: Record<IconKey, LucideIcon> = {
  "file-check": FileCheck,
  dollar: DollarSign,
  "calendar-check": CalendarCheck,
  "user-edit": UserPen,
  survey: ClipboardList,
  smartphone: Smartphone,
  video: Video,
  target: Target,
  "shield-check": ShieldCheck,
  star: Star,
  gift: Gift,
  certificate: FileBadge,
  consulting: Briefcase,
  diagnosis: ChartColumnBig,
  ebook: BookOpen,
  mug: Coffee,
  discount: BadgePercent,
  priority: Award,
  trophy: Trophy,
  crown: Crown,
  medal: Medal,
  flame: Flame,
  sparkles: Sparkles,
  rocket: Rocket,
  building: Building2,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  refresh: RefreshCw,
};

export function RewardIcon({
  name,
  className,
}: {
  name: IconKey;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Star;
  return <Icon className={cn("size-5", className)} aria-hidden />;
}
