import type { BarColor } from "@/lib/parcelamento";
import { cn } from "@/lib/utils";

const RING_COLOR: Record<BarColor, string> = {
  green: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
};

/**
 * Anel de progresso circular com a % no centro. Usado nos cards e no detalhe
 * de parcelamento. A cor segue a urgência da próxima parcela (verde/amarelo/vermelho).
 */
export function ProgressRing({
  pct,
  cor = "green",
  size = 72,
  stroke = 6,
}: {
  pct: number;
  cor?: BarColor;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 100));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped)}% concluído`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className="text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          stroke="currentColor"
          className={cn(
            "transition-[stroke-dashoffset] duration-500",
            RING_COLOR[cor],
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold leading-none tabular-nums"
          style={{ fontSize: Math.round(size * 0.26) }}
        >
          {Math.round(clamped)}%
        </span>
        <span
          className="leading-none text-muted-foreground"
          style={{
            fontSize: Math.max(9, Math.round(size * 0.12)),
            marginTop: Math.round(size * 0.05),
          }}
        >
          concluído
        </span>
      </div>
    </div>
  );
}
