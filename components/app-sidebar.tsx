"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  FileText,
  Files,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/painel", icon: LayoutDashboard },
  { label: "Clientes", href: "/painel/clientes", icon: Users },
  { label: "Faturamento", href: "/painel/faturamento", icon: TrendingUp },
  { label: "Documentos", href: "/painel/documentos", icon: FileText },
  { label: "Enviar documento", href: "/painel/enviar", icon: Upload },
  { label: "Histórico", href: "/painel/historico", icon: History },
  { label: "Configurações", href: "/painel/configuracoes", icon: Settings },
];

const CLIENT_NAV: NavItem[] = [
  { label: "Início", href: "/portal", icon: LayoutDashboard },
  { label: "Meu faturamento", href: "/portal/faturamento", icon: TrendingUp },
  { label: "Meus boletos", href: "/portal/boletos", icon: FileText },
  { label: "Documentos", href: "/portal/documentos", icon: Files },
  { label: "Folha de pagamento", href: "/portal/folha", icon: Wallet },
  { label: "Notificações", href: "/portal/notificacoes", icon: Bell },
];

const INDEX_HREFS = new Set(["/painel", "/portal"]);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppSidebar({
  role,
  userName,
  roleLabel,
  brandSubtitle,
  brandName,
  brandLogoUrl,
}: {
  role: Role;
  userName: string;
  roleLabel: string;
  brandSubtitle?: string;
  brandName?: string | null;
  brandLogoUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = role === "admin" ? ADMIN_NAV : CLIENT_NAV;
  const [open, setOpen] = useState(false);

  // Fecha o drawer com a tecla Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function navLinks(onNavigate?: () => void) {
    return items.map((item) => {
      const active = INDEX_HREFS.has(item.href)
        ? pathname === item.href
        : pathname.startsWith(item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            active
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {item.label}
        </Link>
      );
    });
  }

  const userFooter = (
    <div className="flex items-center gap-2.5 border-t p-3">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
          {initials(userName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">{userName}</div>
        <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={signOut}
        aria-label="Sair"
        title="Sair"
      >
        <LogOut />
      </Button>
    </div>
  );

  return (
    <>
      {/* Barra superior — só no mobile */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu />
        </Button>
      </header>

      {/* Sidebar fixa — só no desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b px-4 py-4">
          <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navLinks()}
        </nav>
        {userFooter}
      </aside>

      {/* Drawer — só no mobile, quando aberto */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[82%] flex-col bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-4">
              <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
              >
                <X />
              </Button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
              {navLinks(() => setOpen(false))}
            </nav>
            {userFooter}
          </aside>
        </div>
      ) : null}
    </>
  );
}
