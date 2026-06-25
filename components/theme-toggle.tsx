"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Alterna entre tema claro e escuro. A escolha é guardada no localStorage e
 * aplicada cedo por um script inline no layout (evita "piscar" ao carregar).
 * Aqui só lemos/gravamos a classe `dark` no <html> e persistimos a preferência.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sincroniza o estado do botão com o que o script inline já aplicou.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage indisponível (modo privado etc.) — ignora.
    }
  }

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
