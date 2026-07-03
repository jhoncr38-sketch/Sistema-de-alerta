"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Moeda SJ — disco dourado que escala com o `font-size` do texto ao redor
 * (dimensões em `em`), então serve tanto num rótulo pequeno quanto no card grande.
 */
export function Coin({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-[1.15em] shrink-0 items-center justify-center rounded-full",
        "bg-gradient-to-b from-amber-300 to-amber-500 text-[0.62em] font-bold text-amber-900",
        "shadow-sm ring-1 ring-inset ring-amber-600/40",
        className,
      )}
      aria-hidden
    >
      $
    </span>
  );
}

/** Formata inteiro no padrão pt-BR (1.240). */
function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

/**
 * Número que anima até o valor alvo (ease-out). Conta a partir de 0 na primeira
 * montagem e do valor anterior quando muda — é o "feedback visual ao ganhar moedas".
 * Respeita prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  className,
  duration = 700,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  // Começa em 0 no SSR/primeira pintura e conta até o valor no mount (sem
  // "piscar" o número final antes de animar). Depois anima a cada mudança.
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)}>{fmt(display)}</span>
  );
}

/**
 * Valor + moeda numa linha. `signed` prefixa +/− (para ganhos e resgates no extrato).
 */
export function CoinAmount({
  value,
  signed = false,
  animate = false,
  className,
  coinClassName,
}: {
  value: number;
  signed?: boolean;
  animate?: boolean;
  className?: string;
  coinClassName?: string;
}) {
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", className)}>
      <span className="tabular-nums">
        {sign}
        {animate ? (
          <AnimatedNumber value={Math.abs(value)} />
        ) : (
          fmt(Math.abs(value))
        )}
      </span>
      <Coin className={coinClassName} />
    </span>
  );
}
