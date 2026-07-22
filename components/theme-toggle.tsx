"use client";

import { useSyncExternalStore } from "react";
import { Check, Leaf, Moon, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Seletor de tema: Claro · Escuro · Sereno. A escolha é guardada no localStorage
 * e aplicada cedo por um script inline no layout (evita "piscar" ao carregar).
 * O tema Sereno é um tema claro e quente (classe `sereno`); o escuro usa `dark`.
 *
 * Lemos o tema com useSyncExternalStore — reflete a classe do <html> sem render
 * em cascata nem erro de hidratação; o MutationObserver avisa quando ela muda.
 */
type Theme = "light" | "dark" | "sereno";

const OPTIONS: { key: Theme; label: string; Icon: LucideIcon }[] = [
  { key: "light", label: "Claro", Icon: Sun },
  { key: "dark", label: "Escuro", Icon: Moon },
  { key: "sereno", label: "Sereno", Icon: Leaf },
];

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  const c = document.documentElement.classList;
  if (c.contains("dark")) return "dark";
  if (c.contains("sereno")) return "sereno";
  return "light";
}

function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", t === "dark");
  el.classList.toggle("sereno", t === "sereno");
  try {
    localStorage.setItem("theme", t);
  } catch {
    // localStorage indisponível (modo privado etc.) — ignora.
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    currentTheme,
    () => "light" as Theme,
  );
  const CurrentIcon =
    theme === "dark" ? Moon : theme === "sereno" ? Leaf : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mudar tema"
            title="Tema"
          />
        }
      >
        <CurrentIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ key, label, Icon }) => (
          <DropdownMenuItem key={key} onClick={() => applyTheme(key)}>
            <Icon />
            {label}
            {theme === key ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
