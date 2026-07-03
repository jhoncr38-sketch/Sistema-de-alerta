import { Lock } from "lucide-react";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { formatDate } from "@/lib/format";
import type { Achievement } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/** Grade de medalhas. Conquistadas em dourado; bloqueadas esmaecidas com cadeado. */
export function Achievements({ items }: { items: Achievement[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-start gap-3 rounded-2xl p-4 ring-1 transition-shadow",
            a.unlocked
              ? "bg-card shadow-sm ring-amber-300/50 hover:shadow-md dark:ring-amber-500/25"
              : "bg-muted/40 ring-foreground/10",
          )}
        >
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl [&_svg]:size-5",
              a.unlocked
                ? "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-sm"
                : "bg-muted text-muted-foreground",
            )}
          >
            {a.unlocked ? (
              <RewardIcon name={a.icon} />
            ) : (
              <Lock className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                !a.unlocked && "text-muted-foreground",
              )}
            >
              {a.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {a.description}
            </p>
            <p className="mt-1.5 text-xs font-medium">
              {a.unlocked ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Conquistada
                  {a.unlockedAt ? ` em ${formatDate(a.unlockedAt)}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">A conquistar</span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
