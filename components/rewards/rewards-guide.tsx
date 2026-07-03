"use client";

import { useEffect, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GuideFullContent, ONBOARDING_STEPS } from "./guide-content";

/**
 * Guia do SJ Rewards: botão "Como funciona" no header, um drawer lateral com o
 * texto institucional completo e um onboarding de 4 telas que aparece só na
 * primeira visita. Tudo é sobreposto/portalizado — a home do Rewards não ganha
 * nenhum bloco novo, preservando o layout limpo.
 *
 * O "já vi o onboarding" fica no localStorage (mesmo padrão do tema do portal).
 * É por navegador; para onboarding isso é aceitável e evita mexer no banco.
 */
const SEEN_KEY = "sj-rewards-guide-seen";

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
    return true; // Na dúvida, não incomoda com o onboarding.
  }
}

export function RewardsGuide() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Abre o onboarding só na 1ª visita, e apenas depois de montar no cliente.
  // O setState no efeito é proposital: ler localStorage só após a montagem é o
  // que garante que servidor e cliente renderizem igual (o servidor não tem
  // localStorage), evitando erro de hidratação. Daí o disable pontual.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver acima
    if (!hasSeen()) setOnboardingOpen(true);
  }, []);

  function closeOnboarding() {
    markSeen();
    setOnboardingOpen(false);
  }

  function openDrawerFromOnboarding() {
    closeOnboarding();
    setDrawerOpen(true);
  }

  const total = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDrawerOpen(true)}
        aria-label="Como funciona o SJ Rewards"
      >
        <SparklesIcon />
        Como funciona
      </Button>

      {/* Drawer lateral (não-modal): a tela principal continua visível e usável. */}
      <BaseDialog.Root
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        modal={false}
      >
        <BaseDialog.Portal>
          <BaseDialog.Popup
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none",
              "duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <BaseDialog.Title className="font-heading text-base font-semibold">
                  Como funciona o SJ Rewards
                </BaseDialog.Title>
                <p className="text-xs text-muted-foreground">
                  Guia completo do clube de vantagens
                </p>
              </div>
              <BaseDialog.Close
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <XIcon />
                <span className="sr-only">Fechar</span>
              </BaseDialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <GuideFullContent />
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>

      {/* Onboarding de 4 telas — só na primeira visita. */}
      <Dialog
        open={onboardingOpen}
        onOpenChange={(open) => {
          if (!open) closeOnboarding();
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <div className="text-4xl" aria-hidden>
              {current.emoji}
            </div>
            <DialogTitle className="text-lg">{current.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {current.body}
            </DialogDescription>
          </div>

          {/* Indicador de progresso das telas. */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.title}
                aria-hidden
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {isFirst ? (
              <Button variant="ghost" size="sm" onClick={closeOnboarding}>
                Pular
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                <ChevronLeftIcon />
                Voltar
              </Button>
            )}

            {isLast ? (
              <Button size="sm" onClick={closeOnboarding}>
                Começar 🚀
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Próximo
                <ChevronRightIcon />
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={openDrawerFromOnboarding}
            className="mx-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <BookOpenIcon className="size-3.5" />
            Ver o guia completo
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
