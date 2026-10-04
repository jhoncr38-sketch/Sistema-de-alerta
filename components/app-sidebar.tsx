"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  PanelLeftClose,
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

interface Grupo {
  /** Rótulo do grupo (sem rótulo = itens principais do topo). */
  titulo?: string;
  /** Itens menores (grupo "Mais" do portal). */
  compacto?: boolean;
  itens: NavItem[];
}

// Painel do contador: "Enviar documento" é o botão fixo do topo (fora da lista).
const ADMIN_GRUPOS: Grupo[] = [
  {
    itens: [
      { label: "Clientes", href: "/painel/clientes", icon: Users },
      { label: "Solicitações", href: "/painel/solicitacoes", icon: FileClock },
    ],
  },
  {
    titulo: "Guias e documentos",
    itens: [
      { label: "Parcelamentos", href: "/painel/parcelamentos", icon: Layers },
      { label: "Folha de pagamento", href: "/painel/folha", icon: Wallet },
      { label: "Documentos", href: "/painel/documentos", icon: FileText },
    ],
  },
  {
    titulo: "Relatórios",
    itens: [
      { label: "Faturamento", href: "/painel/faturamento", icon: TrendingUp },
      { label: "Relatório do mês", href: "/painel/relatorio", icon: FileBarChart2 },
      { label: "Histórico", href: "/painel/historico", icon: History },
    ],
  },
  {
    titulo: "Mais",
    itens: [
      { label: "SJ Rewards", href: "/painel/rewards", icon: Gift },
      { label: "Configurações", href: "/painel/configuracoes", icon: Settings },
    ],
  },
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
const CHAVE_RECOLHIDO = "sj-menu-collapsed";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Texto que some (sem pular) quando o menu recolhe — só no desktop. */
const SOME_RECOLHIDO =
  "whitespace-nowrap transition-[opacity,max-width] duration-200 motion-reduce:transition-none md:recolhido:max-w-0 md:recolhido:overflow-hidden md:recolhido:opacity-0";

/** Dica à direita do item, só com o menu recolhido (no hover). */
function Dica({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 hidden -translate-y-1/2 rounded-[7px] bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover/item:opacity-100 group-focus-visible/item:opacity-100 md:recolhido:block"
    >
      {children}
    </span>
  );
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
  tarefasPendentes = 0,
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
  /** Contador: tarefas pendentes (2ª via + confirmações) — badge de Clientes. */
  tarefasPendentes?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isClient = role === "client";
  const principais = useMemo(
    () => CLIENT_NAV.filter((item) => chatEnabled || item.href !== "/portal/conversar"),
    [chatEnabled],
  );
  const grupos: Grupo[] = useMemo(
    () =>
      isClient
        ? [{ itens: principais }, { titulo: "Mais", compacto: true, itens: CLIENT_MAIS }]
        : ADMIN_GRUPOS,
    [isClient, principais],
  );
  const todosItens = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  const [open, setOpen] = useState(false);

  const isActive = useCallback(
    (href: string) =>
      INDEX_HREFS.has(href) ? pathname === href : pathname.startsWith(href),
    [pathname],
  );

  // Clube desligado na empresa ativa: o item continua clicável (leva à
  // vitrine), mas ganha um cadeado que sinaliza "não incluído".
  const isLocked = (href: string) => isClient && !rewardsEnabled && href === "/portal/rewards";

  /** Contagem do item (badge) e a cor dela. */
  function badgeDe(href: string): { n: number; cor: string } | null {
    if (isClient && href === "/portal/boletos" && boletosVencidos > 0)
      return { n: boletosVencidos, cor: "bg-red-600 text-white" };
    if (isClient && href === "/portal/documentos" && documentosPendentes > 0)
      return { n: documentosPendentes, cor: "bg-primary text-primary-foreground" };
    if (!isClient && href === "/painel/clientes" && tarefasPendentes > 0)
      return { n: tarefasPendentes, cor: "bg-primary text-primary-foreground" };
    return null;
  }

  // ----- Recolher (desktop) -----
  // O estado de verdade é o atributo no <html> (o script inicial já aplica o
  // salvo antes de pintar); aqui só alternamos e guardamos a preferência.
  const alternarRecolhido = useCallback(() => {
    const raiz = document.documentElement;
    const recolher = raiz.getAttribute("data-menu") !== "recolhido";
    if (recolher) raiz.setAttribute("data-menu", "recolhido");
    else raiz.removeAttribute("data-menu");
    try {
      localStorage.setItem(CHAVE_RECOLHIDO, recolher ? "1" : "0");
    } catch {
      /* navegador sem localStorage: só não lembra */
    }
  }, []);

  // Atalho "[" (fora de campos de texto).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      e.preventDefault();
      alternarRecolhido();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alternarRecolhido]);

  // ----- Indicador deslizante (desktop) -----
  // Um fundo único atrás dos itens que "anda" até o ativo. Mexemos direto no
  // estilo do elemento (sem estado), e remedimos quando o menu muda de largura.
  const indicadorRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const medir = useCallback(() => {
    const ind = indicadorRef.current;
    if (!ind) return;
    const ativo = todosItens.find((i) => isActive(i.href));
    const el = ativo ? itemRefs.current.get(ativo.href) : undefined;
    if (!el) {
      ind.style.opacity = "0";
      return;
    }
    ind.style.opacity = "1";
    ind.style.top = `${el.offsetTop}px`;
    ind.style.height = `${el.offsetHeight}px`;
  }, [todosItens, isActive]);

  useLayoutEffect(() => {
    medir();
  }, [medir]);

  useEffect(() => {
    // Mudou o atributo (recolheu/expandiu)? Remede ao fim da transição de largura.
    const obs = new MutationObserver(() => window.setTimeout(medir, 230));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-menu"] });
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

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

  /** Itens de navegação. `desktop`: usa o indicador deslizante e o recolher. */
  function navegacao(desktop: boolean, onNavigate?: () => void) {
    return grupos.map((g, gi) => (
      <div key={g.titulo ?? `g${gi}`} className="flex flex-col gap-0.5">
        {g.titulo ? (
          <div
            className={cn(
              "mx-3 mt-3.5 mb-1 text-[11px] tracking-wide whitespace-nowrap text-muted-foreground uppercase",
              desktop &&
                "md:recolhido:mx-3 md:recolhido:my-2 md:recolhido:h-px md:recolhido:overflow-hidden md:recolhido:bg-border md:recolhido:text-transparent",
            )}
          >
            {g.titulo}
          </div>
        ) : null}
        {g.itens.map((item) => {
          const Icon = item.icon;
          const ativo = isActive(item.href);
          const badge = badgeDe(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              ref={
                desktop
                  ? (el) => {
                      if (el) itemRefs.current.set(item.href, el);
                      else itemRefs.current.delete(item.href);
                    }
                  : undefined
              }
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "group/item relative z-[1] flex items-center gap-2.5 rounded-lg px-2.5 transition-colors duration-150",
                g.compacto ? "py-1.5 text-[13px]" : "py-[7px] text-sm",
                ativo
                  ? cn("font-medium text-primary", !desktop && "bg-primary/10")
                  : "text-muted-foreground hover:bg-black/[.04] hover:text-foreground dark:hover:bg-white/[.06]",
                desktop && "md:recolhido:px-3.5",
              )}
            >
              <span className="relative shrink-0">
                <Icon
                  className={cn(
                    "transition-transform duration-150 group-hover/item:translate-x-[2px] motion-reduce:transition-none",
                    g.compacto ? "size-3.5" : "size-4",
                    desktop && "md:recolhido:size-[18px]",
                  )}
                />
                {badge && desktop ? (
                  // Recolhido: a contagem vira um ponto no canto do ícone.
                  <span
                    className={cn(
                      "absolute -top-[3px] -right-1 hidden size-2 rounded-full ring-2 ring-card md:recolhido:block",
                      badge.cor,
                    )}
                  />
                ) : null}
              </span>
              <span className={cn("min-w-0 truncate", desktop && cn("max-w-[180px]", SOME_RECOLHIDO))}>
                {item.label}
              </span>
              {badge ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-[7px] py-px text-[11px] font-semibold tabular-nums",
                    badge.cor,
                    desktop && "md:recolhido:hidden",
                  )}
                >
                  {badge.n}
                </span>
              ) : isLocked(item.href) ? (
                <Lock
                  className={cn(
                    "ml-auto size-3.5 text-muted-foreground/70",
                    desktop && "md:recolhido:hidden",
                  )}
                />
              ) : null}
              {desktop ? <Dica>{item.label}</Dica> : null}
            </Link>
          );
        })}
      </div>
    ));
  }

  /** Botão fixo "Enviar documento" (painel do contador). */
  function botaoEnviar(desktop: boolean, onNavigate?: () => void) {
    if (isClient) return null;
    const ativo = pathname.startsWith("/painel/enviar");
    return (
      <Link
        href="/painel/enviar"
        onClick={onNavigate}
        className={cn(
          "group/item relative mx-3 mt-3 flex h-[38px] items-center justify-center gap-2 rounded-[9px] bg-primary text-sm font-medium text-primary-foreground transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-[1.08] motion-reduce:transition-none",
          ativo && "ring-2 ring-primary/30 ring-offset-1 ring-offset-card",
          desktop && "md:recolhido:mx-2.5",
        )}
      >
        <Upload className="size-4 shrink-0" />
        <span className={cn(desktop && cn("max-w-[160px]", SOME_RECOLHIDO))}>
          Enviar documento
        </span>
        {desktop ? <Dica>Enviar documento</Dica> : null}
      </Link>
    );
  }

  function rodapeUsuario(desktop: boolean) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 border-t p-3",
          desktop && "md:recolhido:flex-col md:recolhido:gap-1.5 md:recolhido:px-2",
        )}
      >
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {initials(userName)}
          </AvatarFallback>
        </Avatar>
        <div
          className={cn(
            "min-w-0 flex-1 leading-tight",
            desktop && cn("max-w-[160px]", SOME_RECOLHIDO),
          )}
        >
          <div className="truncate text-sm font-medium">{userName}</div>
          <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sair" title="Sair">
          <LogOut />
        </Button>
      </div>
    );
  }

  // Barra inferior do celular (cliente): 4 atalhos + "Mais" (abre o drawer).
  // Com a conversa desligada, o 4º atalho vira Parcelamentos.
  const bottomItems = principais
    .filter((i) => i.href !== "/portal/parcelamentos" || !chatEnabled)
    .slice(0, 4);
  const maisAtivo = open || !bottomItems.some((i) => isActive(i.href));

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
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </Button>
        )}
      </header>

      {/* Sidebar fixa — só no desktop (recolhível) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card transition-[width] duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none md:flex md:recolhido:w-16">
        <div className="border-b px-4 py-4 md:recolhido:px-3.5">
          <Brand subtitle={brandSubtitle} name={brandName} logoUrl={brandLogoUrl} />
        </div>
        {botaoEnviar(true)}
        <nav className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 md:recolhido:overflow-visible">
          {/* Fundo que desliza até o item ativo. */}
          <span
            ref={indicadorRef}
            aria-hidden
            className="pointer-events-none absolute right-2 left-2 z-0 rounded-lg bg-primary/10 opacity-0 shadow-[inset_3px_0_0_var(--primary)] transition-[top,height] duration-[280ms,200ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
          />
          {navegacao(true)}
        </nav>
        <button
          type="button"
          onClick={alternarRecolhido}
          aria-label="Recolher ou expandir o menu"
          className="group/item relative mx-2 mb-2 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/[.06] md:recolhido:px-3.5"
        >
          <PanelLeftClose className="size-[18px] shrink-0 transition-transform duration-200 motion-reduce:transition-none md:recolhido:rotate-180" />
          <span className={cn("max-w-[160px]", SOME_RECOLHIDO)}>Recolher menu</span>
          <kbd className="ml-auto rounded border px-1.5 font-mono text-[11px] md:recolhido:hidden">[</kbd>
          <Dica>Expandir menu ( [ )</Dica>
        </button>
        {rodapeUsuario(true)}
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
            const badge = badgeDe(item.href);
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
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-2.5 rounded-full px-[5px] text-[10px] leading-4 font-semibold tabular-nums",
                        badge.cor,
                      )}
                    >
                      {badge.n}
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
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X />
              </Button>
            </div>
            {botaoEnviar(false, () => setOpen(false))}
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
              {navegacao(false, () => setOpen(false))}
            </nav>
            {rodapeUsuario(false)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
