"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  FileBarChart2,
  FileClock,
  FileText,
  Files,
  Gift,
  History,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircle,
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
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rótulo curto na barra inferior do celular. */
  short?: string;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/painel", icon: LayoutDashboard },
  { label: "Clientes", href: "/painel/clientes", icon: Users },
  { label: "SJ Rewards", href: "/painel/rewards", icon: Gift },
  { label: "Faturamento", href: "/painel/faturamento", icon: TrendingUp },
  { label: "Relatório do mês", href: "/painel/relatorio", icon: FileBarChart2 },
  { label: "Parcelamentos", href: "/painel/parcelamentos", icon: Layers },
  { label: "Folha de pagamento", href: "/painel/folha", icon: Wallet },
  { label: "Documentos", href: "/painel/documentos", icon: FileText },
  { label: "Solicitações", href: "/painel/solicitacoes", icon: FileClock },
  { label: "Enviar documento", href: "/painel/enviar", icon: Upload },
  { label: "Histórico", href: "/painel/historico", icon: History },
  { label: "Configurações", href: "/painel/configuracoes", icon: Settings },
];

// Portal do cliente: 5 itens principais + grupo "Mais".
const CLIENT_NAV: NavItem[] = [
  { label: "Início", short: "Início", href: "/portal", icon: LayoutDashboard },
  { label: "Meus boletos", short: "Boletos", href: "/portal/boletos", icon: FileText },
  { label: "Parcelamentos", short: "Parcelas", href: "/portal/parcelamentos", icon: Layers },
  { label: "Documentos e folha", short: "Documentos", href: "/portal/documentos", icon: Files },
  { label: "Converse com sua empresa", short: "Conversar", href: "/portal/conversar", icon: MessageCircle },
];

const CLIENT_MAIS: NavItem[] = [
  { label: "Meu faturamento", href: "/portal/faturamento", icon: TrendingUp },
  { label: "Solicitações", href: "/portal/solicitacoes", icon: FileClock },
  { label: "SJ Rewards", href: "/portal/rewards", icon: Gift },
  { label: "Notificações", href: "/portal/notificacoes", icon: Bell },
  { label: "Minha conta", href: "/portal/conta", icon: Settings },
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
  rewardsEnabled = true,
  chatEnabled = true,
  boletosVencidos = 0,
  documentosPendentes = 0,
}: {
  role: Role;
  userName: string;
  roleLabel: string;
  brandSubtitle?: string;
  brandName?: string | null;
  brandLogoUrl?: string | null;
  /** SJ Rewards ligado para a empresa ativa; false trava o item do menu. */
  rewardsEnabled?: boolean;
  /** Aba "Converse com sua empresa" ligada; false remove o item do menu. */
  chatEnabled?: boolean;
  /** Boletos vencidos da empresa ativa (badge vermelho em "Meus boletos"). */
  boletosVencidos?: number;
  /** Documentos pedidos pelo contador e ainda não enviados (badge azul). */
  documentosPendentes?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isClient = role === "client";
  // Aba de conversa desligada para a empresa ativa: remove o item do menu.
  const items = (isClient ? CLIENT_NAV : ADMIN_NAV).filter(
    (item) => chatEnabled || item.href !== "/portal/conversar",
  );
  const mais = isClient ? CLIENT_MAIS : [];
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

  const isActive = (href: string) =>
    INDEX_HREFS.has(href) ? pathname === href : pathname.startsWith(href);

  // Clube desligado na empresa ativa: o item continua clicável (leva à
  // vitrine), mas ganha um cadeado que sinaliza "não incluído".
  const isLocked = (href: string) => !rewardsEnabled && href === "/portal/rewards";

  function navLinks(onNavigate?: () => void) {
    return items.map((item) => {
      const Icon = item.icon;
      const badge =
        isClient && item.href === "/portal/boletos" && boletosVencidos > 0
          ? boletosVencidos
          : null;
      const badgeDocs =
        isClient && item.href === "/portal/documentos" && documentosPendentes > 0
          ? documentosPendentes
          : null;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isActive(item.href)
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {item.label}
          {badge ? (
            <span className="ml-auto rounded-full bg-red-600 px-[7px] py-px text-[11px] font-semibold text-white tabular-nums">
              {badge}
            </span>
          ) : badgeDocs ? (
            <span className="ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground tabular-nums">
              {badgeDocs}
            </span>
          ) : isLocked(item.href) ? (
            <Lock className="ml-auto size-3.5 text-muted-foreground/70" />
          ) : null}
        </Link>
      );
    });
  }

  function maisLinks(onNavigate?: () => void) {
    if (mais.length === 0) return null;
    return (
      <>
        <div className="mx-3 mt-3 mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
          Mais
        </div>
        {mais.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
              {isLocked(item.href) ? (
                <Lock className="ml-auto size-3.5 text-muted-foreground/70" />
              ) : null}
            </Link>
          );
        })}
      </>
    );
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
      <ThemeToggle />
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

  // Barra inferior do celular (cliente): 4 atalhos + "Mais" (abre o drawer).
  // Com a conversa desligada, o 4º atalho vira Parcelamentos.
  const bottomItems = items
    .filter((i) => i.href !== "/portal/parcelamentos" || !chatEnabled)
    .slice(0, 4);
  const maisAtivo =
    open ||
    !bottomItems.some((i) => isActive(i.href));

  return (
    <>
      {/* Barra superior — só no mobile */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
        {isClient ? (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label="Notificações"
            render={
              <Link href="/portal/notificacoes">
                <Bell />
              </Link>
            }
          />
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
        )}
      </header>

      {/* Sidebar fixa — só no desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b px-4 py-4">
          <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navLinks()}
          {maisLinks()}
        </nav>
        {userFooter}
      </aside>

      {/* Barra inferior fixa — só no celular, portal do cliente */}
      {isClient ? (
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 grid h-[78px] grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const ativo = isActive(item.href) && !open;
            const badge =
              item.href === "/portal/boletos" && boletosVencidos > 0
                ? boletosVencidos
                : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  ativo ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" />
                  {badge ? (
                    <span className="absolute -top-1.5 -right-2.5 rounded-full bg-red-600 px-[5px] text-[10px] leading-4 font-semibold text-white tabular-nums">
                      {badge}
                    </span>
                  ) : null}
                </span>
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
              maisAtivo ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-[22px]" />
            Mais
          </button>
        </nav>
      ) : null}

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
              {maisLinks(() => setOpen(false))}
            </nav>
            {userFooter}
          </aside>
        </div>
      ) : null}
    </>
  );
}
