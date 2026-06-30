"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Alterna entre tema claro e escuro. A escolha é guardada no localStorage e
 * aplicada cedo por um script inline no layout (evita "piscar" ao carregar).
 * Aqui só lemos/gravamos a classe `dark` no <html> e persistimos a preferência.
 *
 * Lemos o tema com useSyncExternalStore — a forma recomendada de refletir um
 * estado externo (a classe no <html>) sem render em cascata nem erro de
 * hidratação. O MutationObserver avisa o React quando a classe muda.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/** Lê o tema atual no cliente. No servidor não há <html> — assume claro. */
const isDarkClient = () =>
  document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDarkClient, () => false);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage indisponível (modo privado etc.) — ignora.
    }
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
