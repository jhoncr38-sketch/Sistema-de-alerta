"use client";

import { cn } from "@/lib/utils";

/**
 * Interruptor liga/desliga compacto (30×18), verde quando ligado. Só a
 * aparência + clique; quem usa cuida da ação (server action, toast…).
 */
export function Interruptor({
  ligado,
  onClick,
  disabled,
  rotulo,
  title,
}: {
  ligado: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Texto para leitores de tela. */
  rotulo: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
        ligado ? "bg-emerald-600" : "bg-neutral-300 dark:bg-neutral-600",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
          ligado && "translate-x-[12px]",
        )}
      />
    </button>
  );
}
