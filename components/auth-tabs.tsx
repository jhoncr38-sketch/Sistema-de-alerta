"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/login", label: "Entre" },
  { href: "/register", label: "Cadastre-se" },
];

/** Alternador Entre / Cadastre-se no topo das telas de login e cadastro. */
export function AuthTabs() {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
