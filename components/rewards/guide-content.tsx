import type { ReactNode } from "react";

/**
 * Conteúdo textual do guia do SJ Rewards, separado da lógica de UI para facilitar
 * ajustes de copy sem mexer no componente. Duas formas do mesmo material:
 *
 * - ONBOARDING_STEPS: versão curta (4 telas) mostrada só na 1ª visita.
 * - GuideFullContent: o texto institucional completo, exibido no drawer lateral
 *   sempre que a pessoa clica em "Como funciona".
 */

export type OnboardingStep = {
  emoji: string;
  title: string;
  body: ReactNode;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    emoji: "🎉",
    title: "Bem-vindo ao SJ Rewards",
    body: (
      <>
        Muito mais do que um programa de pontos: uma parceria que valoriza a
        organização da sua empresa. A cada boa prática de gestão você acumula{" "}
        <strong className="text-foreground">SJ Coins</strong>, nossa moeda de
        recompensas.
      </>
    ),
  },
  {
    emoji: "🪙",
    title: "Como você ganha",
    body: (
      <>
        Enviando documentos no prazo, mantendo os pagamentos em dia, atualizando
        seus dados, usando o app e concluindo missões. Quanto mais você
        participa, mais <strong className="text-foreground">SJ Coins</strong>{" "}
        acumula.
      </>
    ),
  },
  {
    emoji: "🎁",
    title: "O que dá pra trocar",
    body: (
      <>
        Troque suas moedas por benefícios exclusivos: consultorias, atendimento
        prioritário, descontos em serviços, brindes e acesso antecipado a novas
        funcionalidades.
      </>
    ),
  },
  {
    emoji: "🏅",
    title: "Evolua de nível",
    body: (
      <>
        Você também acumula <strong className="text-foreground">XP</strong> e
        sobe de nível: 🥉 Bronze, 🥈 Prata, 🥇 Ouro, 💎 Diamante e 👑 Elite.
        Quanto maior o nível, mais vantagens desbloqueadas.
      </>
    ),
  },
];

function GuideHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-heading text-base font-semibold text-foreground">
      {children}
    </h3>
  );
}

/** Texto institucional completo — corpo do drawer "Como funciona". */
export function GuideFullContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
      <section className="space-y-2">
        <GuideHeading>🎉 Bem-vindo ao SJ Rewards</GuideHeading>
        <p className="font-medium text-foreground">
          Muito mais do que um programa de pontos. Uma parceria que valoriza a
          sua organização.
        </p>
        <p>
          Na <strong>S J Contabilidade</strong>, acreditamos que uma empresa
          organizada cresce com mais segurança, toma melhores decisões e
          aproveita mais oportunidades.
        </p>
        <p>
          Pensando nisso, criamos o <strong>SJ Rewards</strong>, um programa
          exclusivo que reconhece e recompensa os clientes que mantêm uma
          parceria ativa com nosso escritório.
        </p>
        <p>
          Sempre que você realizar ações que contribuem para uma gestão mais
          eficiente da sua empresa — como enviar documentos dentro do prazo,
          manter seus pagamentos em dia, utilizar o aplicativo e acompanhar as
          informações do seu negócio — você acumulará <strong>SJ Coins</strong>,
          nossa moeda de recompensas.
        </p>
        <p>
          Essas moedas poderão ser trocadas por diversos benefícios exclusivos,
          como consultorias, análises financeiras, descontos em serviços,
          brindes, atendimento prioritário e muitas outras vantagens.
        </p>
      </section>

      <section className="space-y-2">
        <GuideHeading>🎯 Qual é a finalidade do SJ Rewards?</GuideHeading>
        <p>
          O objetivo do programa é incentivar boas práticas de gestão
          empresarial, tornando a rotina da sua empresa mais organizada,
          eficiente e segura.
        </p>
        <p>
          Ao participar do SJ Rewards, você ganha muito mais do que pontos. Você
          passa a contar com um sistema que incentiva hábitos que ajudam sua
          empresa a crescer de forma sustentável.
        </p>
        <p>
          Cada ação realizada representa um passo em direção a uma empresa mais
          organizada e preparada para o futuro.
        </p>
      </section>

      <section className="space-y-2">
        <GuideHeading>🪙 Como funciona?</GuideHeading>
        <p>É muito simples. Você realiza ações no aplicativo, como:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Enviar documentos dentro do prazo;</li>
          <li>Manter seus pagamentos em dia;</li>
          <li>Atualizar seus dados cadastrais;</li>
          <li>Utilizar os recursos da plataforma;</li>
          <li>Concluir missões e desafios propostos;</li>
          <li>Participar das novidades e campanhas da S J Contabilidade.</li>
        </ul>
        <p>
          Cada ação gera uma quantidade de <strong>SJ Coins</strong>, que ficam
          disponíveis em sua conta. Quanto mais você participa, mais moedas
          acumula.
        </p>
      </section>

      <section className="space-y-2">
        <GuideHeading>🎁 O que posso fazer com minhas SJ Coins?</GuideHeading>
        <p>
          As SJ Coins podem ser trocadas por diversos benefícios exclusivos,
          como:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Consultorias especializadas;</li>
          <li>Atendimento prioritário;</li>
          <li>Descontos em serviços;</li>
          <li>Brindes exclusivos;</li>
          <li>Acesso antecipado a novas funcionalidades;</li>
          <li>Conteúdos e materiais exclusivos.</li>
        </ul>
        <p>Novas recompensas serão adicionadas periodicamente.</p>
      </section>

      <section className="space-y-2">
        <GuideHeading>🏅 Evolua de nível</GuideHeading>
        <p>
          Além das SJ Coins, você também acumula <strong>XP (Experiência)</strong>.
        </p>
        <p>
          O XP representa sua evolução dentro do programa e permite que você
          avance entre os níveis:
        </p>
        <ul className="space-y-1">
          <li>🥉 Bronze</li>
          <li>🥈 Prata</li>
          <li>🥇 Ouro</li>
          <li>💎 Diamante</li>
          <li>👑 Elite</li>
        </ul>
        <p>
          Quanto maior seu nível, mais benefícios e vantagens exclusivas serão
          desbloqueados.
        </p>
      </section>

      <section className="space-y-2">
        <GuideHeading>🚀 Um aplicativo que trabalha ao seu lado</GuideHeading>
        <p>
          O SJ Rewards foi desenvolvido para transformar a forma como você
          acompanha sua empresa.
        </p>
        <p>
          Mais do que recompensas, ele incentiva hábitos que tornam sua gestão
          mais organizada, reduzem imprevistos e fortalecem a parceria entre sua
          empresa e a S J Contabilidade.
        </p>
        <p>
          Nosso compromisso é ir além da contabilidade tradicional, oferecendo
          tecnologia, informação e ferramentas que contribuam para o crescimento
          do seu negócio.
        </p>
        <p className="font-medium text-foreground">
          SJ Rewards: porque reconhecer quem faz a gestão da empresa com
          organização também faz parte do nosso trabalho.
        </p>
      </section>
    </div>
  );
}
