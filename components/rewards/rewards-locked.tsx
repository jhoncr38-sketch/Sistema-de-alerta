import Link from "next/link";
import { ArrowLeft, Coins, Gift, Lock, Sparkles, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { LEVEL_VISUAL } from "@/components/rewards/level-badge";
import { LEVELS } from "@/lib/rewards";
import { cn } from "@/lib/utils";

/**
 * Vitrine do SJ Rewards para empresas com o clube DESLIGADO. Deixa CLARO logo de
 * cara que o recurso está bloqueado (faixa de aviso âmbar no topo, com cadeado e
 * CTA para pedir a ativação) e, abaixo, apresenta o programa com o visual premium
 * do clube real — despertando o desejo de participar. Tela estática (nenhuma
 * consulta ao banco), então não pesa nem credita nada.
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
      {/* ---- Aviso de bloqueio: primeira coisa que o cliente vê ---- */}
      <section
        className="overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-50 ring-1 ring-amber-500/20 dark:border-amber-400/30 dark:bg-amber-950/30"
        aria-labelledby="rewards-locked-title"
      >
        {/* Faixa superior de status — impossível de ignorar */}
        <div className="flex items-center gap-2 bg-amber-500 px-5 py-2 text-amber-950">
          <Lock className="size-4" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">
            Acesso bloqueado
          </span>
        </div>

        <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300 [&_svg]:size-7"
            aria-hidden
          >
            <Lock />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="rewards-locked-title"
              className="font-heading text-lg font-semibold text-amber-900 dark:text-amber-100"
            >
              O SJ Rewards ainda não está liberado para a sua empresa
            </h2>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
              Este recurso não está incluído no seu plano atual. Para ativar o
              clube e começar a acumular vantagens, fale com a {brandName}.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Apresentação do programa (prévia do que ele desbloqueia) ---- */}
      <p className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Veja o que você desbloqueia
      </p>

      {/* Herói premium — mesmo tom escuro/dourado do clube real, com selo travado */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1220] via-[#132038] to-[#0b1220] p-6 pt-14 text-white shadow-xl ring-1 ring-amber-300/20 sm:p-8 sm:pt-8">
        {/* Brilhos dourados ao fundo */}
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-amber-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-20 size-60 rounded-full bg-amber-400/10 blur-3xl"
          aria-hidden
        />
        {/* Borda dourada superior fina — acabamento premium */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent"
          aria-hidden
        />

        {/* Selo "Bloqueado" — no mobile centralizado no topo (evita colidir com o
            badge "Programa exclusivo"); a partir de sm, ancorado no canto. */}
        <span className="absolute left-1/2 top-4 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-amber-200 backdrop-blur sm:left-auto sm:right-4 sm:translate-x-0">
          <Lock className="size-3" />
          Bloqueado
        </span>

        <div className="relative flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-amber-300">
            <Sparkles className="size-3.5" />
            Programa exclusivo
          </span>

          {/* Ícone dourado com brilho + cadeado sobreposto (visualmente travado) */}
          <span className="relative flex size-[4.5rem] items-center justify-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg ring-1 ring-amber-300/50 [&_svg]:size-9">
            <span
              className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-amber-400/50 blur-xl"
              aria-hidden
            />
            <Gift />
            <span
              className="absolute -bottom-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full bg-[#0b1220] text-amber-300 ring-2 ring-amber-400/50 [&_svg]:size-3.5"
              aria-hidden
            >
              <Lock />
            </span>
          </span>

          <div>
            <h2 className="text-balance font-heading text-xl font-semibold tracking-tight sm:text-2xl">
              Desbloqueie o SJ Rewards
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

      {/* Rodapé: reforça a orientação e oferece a saída */}
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Quer participar? Solicite a ativação do SJ Rewards à {brandName}.
        </p>
        <Link
          href="/portal"
          className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
        >
          <ArrowLeft />
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
