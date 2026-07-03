import Link from "next/link";
import { ArrowLeft, Coins, Gift, Lock, Sparkles, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LEVEL_VISUAL } from "@/components/rewards/level-badge";
import { LEVELS } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Vitrine do SJ Rewards para empresas com o clube DESLIGADO. Em vez de esconder,
 * apresenta o programa com o MESMO visual premium do clube real (herói escuro +
 * dourado, trilha de níveis) e um aviso elegante de que ainda não está incluído
 * — despertando interesse para pedir a ativação ao contador. Tela estática
 * (nenhuma consulta ao banco), então não pesa nem credita nada.
 */

export function RewardsLocked({ brandName }: { brandName: string }) {
  const perks = [
    {
      icon: Coins,
      gold: true,
      title: "Acumule SJ Coins",
      body: "Ganhe moedas ao pagar em dia, enviar documentos no prazo e usar o app.",
    },
    {
      icon: Gift,
      gold: false,
      title: "Troque por vantagens",
      body: "Consultorias, atendimento prioritário, descontos e brindes exclusivos.",
    },
    {
      icon: Trophy,
      gold: false,
      title: "Suba de nível",
      body: "Evolua de Bronze a Elite e desbloqueie benefícios cada vez maiores.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      {/* Herói premium — mesmo tom escuro/dourado do clube real */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1220] via-[#132038] to-[#0b1220] p-8 text-white shadow-lg ring-1 ring-white/10">
        {/* Brilhos sutis ao fundo */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-amber-500/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-20 size-56 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-amber-300">
            <Sparkles className="size-3.5" />
            Programa exclusivo
          </span>

          {/* Ícone dourado com brilho */}
          <span className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg ring-1 ring-amber-300/50 [&_svg]:size-8">
            <span
              className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-amber-400/40 blur-lg"
              aria-hidden
            />
            <Gift />
          </span>

          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              SJ Rewards
            </h2>
            <p className="mt-1 text-sm text-white/60">
              O clube de vantagens da {brandName}
            </p>
          </div>

          <p className="max-w-md text-sm leading-relaxed text-white/70">
            Muito mais do que um programa de pontos: uma parceria que valoriza a
            organização da sua empresa e recompensa cada boa prática de gestão.
          </p>

          {/* Trilha de níveis */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            {LEVELS.map((l) => {
              const { Icon, onDark } = LEVEL_VISUAL[l.accent];
              return (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs text-white/75"
                >
                  <Icon className={cn("size-3.5", onDark)} />
                  {l.name}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <ul className="divide-y">
          {perks.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.title} className="flex items-start gap-3.5 px-5 py-4">
                <span
                  className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                    p.gold
                      ? "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500/30"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-muted-foreground">{p.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Aviso de bloqueio + CTA */}
      <div className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-inset ring-foreground/10 [&_svg]:size-4">
            <Lock />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              O SJ Rewards ainda não está ativo para a sua empresa.
            </p>
            <p className="text-muted-foreground">
              Fale com a {brandName} para participar do clube e começar a
              acumular vantagens.
            </p>
          </div>
        </div>

        <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft />
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
