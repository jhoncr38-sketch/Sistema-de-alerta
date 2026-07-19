"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Modal de boas-vindas no PRIMEIRO acesso ao portal (qualquer caminho: magic link
 * ou cadastro normal). Convida a "instalar" o app (PWA) na tela inicial, de forma
 * inteligente por aparelho:
 *   • Android/Chrome  → botão de 1 toque (evento nativo `beforeinstallprompt`);
 *   • iPhone/Safari   → passo a passo manual (a Apple não permite instalar sozinho);
 *   • já instalado    → não aparece.
 *
 * Aparece 1× por navegador (localStorage), no mesmo espírito do onboarding do
 * SJ Rewards — sem backend, sem migration. Todo acesso a `window`/`navigator`
 * acontece no efeito (após montar) para não quebrar a hidratação.
 */
const SEEN_KEY = "sj-install-guide-seen";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // localStorage indisponível (aba anônima etc.) — sem persistência, tudo bem.
  }
}

function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // Na dúvida, não incomoda.
  }
}

export function InstallAppOnboarding() {
  // null = não mostra; "android"/"ios" = mostra o conteúdo do aparelho.
  const [env, setEnv] = useState<"android" | "ios" | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (hasSeen()) return;

    const ua = navigator.userAgent || "";
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return; // já instalado / rodando como app

    // Só em celular/tablet (o convite é "instale no seu celular"): no desktop, pula.
    const isMobile =
      navigator.maxTouchPoints > 0 ||
      /android|iphone|ipad|ipod|mobile/i.test(ua);
    if (!isMobile) return;

    const isIos =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPad recente se identifica como Mac com tela sensível ao toque.
      (/macintosh/i.test(ua) && "ontouchend" in document);

    if (isIos) {
      // iOS não tem prompt nativo — instrução manual (só funciona no Safari).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o ambiente só após montar
      setEnv("ios");
      return;
    }

    // Android/Chrome/Edge: espera o evento nativo de instalação (dispara quando o
    // navegador considera o app instalável). Se não disparar, o modal não aparece.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setEnv("android");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dispensar() {
    markSeen();
    setDismissed(true);
  }

  async function instalar() {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice; // aceito ou não, não insistimos depois
    } catch {
      /* silencioso */
    } finally {
      setInstalling(false);
      dispensar();
    }
  }

  const open = env !== null && !dismissed;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dispensar();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <div className="text-4xl" aria-hidden>
            📲
          </div>
          <DialogTitle className="text-lg">
            Instale o app no seu celular
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Deixe o portal na tela inicial, abrindo em tela cheia como um app — com
            acesso rápido aos boletos e avisos de vencimento na hora.
          </DialogDescription>
        </div>

        {env === "ios" ? (
          <>
            <ol className="mt-1 space-y-2.5 rounded-lg border bg-muted/30 p-3.5 text-sm">
              <li className="flex items-center gap-2.5">
                <StepDot n={1} />
                <span>
                  Toque em{" "}
                  <Share className="inline size-4 -translate-y-0.5" aria-hidden />{" "}
                  <strong>Compartilhar</strong>, na barra do Safari
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <StepDot n={2} />
                <span>
                  Escolha <strong>“Adicionar à Tela de Início”</strong>
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <StepDot n={3} />
                <span>
                  Toque em <strong>Adicionar</strong> — pronto! 🎉
                </span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Abriu por um link (ex.: WhatsApp)? Toque em ••• e{" "}
              <strong>“Abrir no Safari”</strong> primeiro.
            </p>
            <div className="mt-1 flex justify-end">
              <Button size="sm" onClick={dispensar}>
                Entendi
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={dispensar}>
              Agora não
            </Button>
            <Button size="sm" onClick={instalar} disabled={installing}>
              {installing ? <Loader2 className="animate-spin" /> : <Download />}
              Instalar agora
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepDot({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {n}
    </span>
  );
}
