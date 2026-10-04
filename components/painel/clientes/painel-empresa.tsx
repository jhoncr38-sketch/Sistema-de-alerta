import Link from "next/link";
import { Upload, X } from "lucide-react";
import {
  convidarAcesso,
  deleteCompany,
  setCompanyAiLimit,
  setCompanyChatEnabled,
  setCompanyRewardsEnabled,
} from "@/app/(admin)/painel/clientes/actions";
import { CompanyAiLimit } from "@/components/company-ai-limit";
import { CompanyChatToggle } from "@/components/company-chat-toggle";
import { CompanyRewardsToggle } from "@/components/company-rewards-toggle";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ConvidarAcessoButton } from "@/components/convidar-acesso-button";
import { EditCompanyButton } from "@/components/edit-company-button";
import { NewClientButton } from "@/components/new-client-button";
import { MapaAnoMini, type EstadoMes } from "@/components/portal/mapa-ano";
import { formatCurrency } from "@/lib/format";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Tom = "red" | "amber" | "blue" | "muted";

const PONTO: Record<Tom, string> = {
  red: "bg-red-600",
  amber: "bg-amber-500",
  blue: "bg-primary",
  muted: "bg-neutral-400",
};

export interface GuiaAberta {
  id: string;
  nome: string;
  situacao: string;
  tom: Tom;
  valor: number | null;
}

export interface Contato {
  chave: string;
  tom: Tom;
  texto: string;
  detalhe: string | null;
  /** "hoje 09:12", "ontem", "28/09". */
  quando: string;
  /** Para ordenar (ISO). */
  em: string;
}

export interface PessoaAcesso {
  id: string;
  nome: string;
  email: string | null;
  acessoTexto: string;
  alerta: boolean;
  /** Pode receber convite de acesso (sumida ou nunca entrou, ativa). */
  convidar: boolean;
}

function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
      {extra}
    </div>
  );
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * Painel lateral da tela Clientes (?empresa=id): tudo sobre uma empresa num
 * lugar só. Em telas largas fica fixo à direita; nas menores abre por cima.
 */
export function PainelEmpresa({
  empresa,
  fecharHref,
  clienteDesde,
  ano,
  mapa,
  guias,
  totalAberto,
  qtdAberto,
  contatos,
  pessoas,
  usoIa,
  limiteIa,
  telefoneEmpresa,
  empresasOpcoes,
}: {
  empresa: Company;
  fecharHref: string;
  clienteDesde: string;
  ano: number;
  mapa: EstadoMes[];
  guias: GuiaAberta[];
  totalAberto: number;
  qtdAberto: number;
  contatos: Contato[];
  pessoas: PessoaAcesso[];
  usoIa: number;
  /** Teto efetivo do mês (0 = ilimitado). */
  limiteIa: number;
  telefoneEmpresa: boolean;
  empresasOpcoes: { id: string; label: string }[];
}) {
  const nome = empresa.nome_fantasia || empresa.razao_social;
  return (
    <>
      {/* Fundo escuro (só quando o painel abre por cima, em telas menores). */}
      <Link
        href={fecharHref}
        scroll={false}
        aria-label="Fechar"
        className="fixed inset-0 z-40 bg-black/30 xl:hidden"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col gap-4 overflow-y-auto border-l bg-card p-[18px] shadow-xl xl:static xl:z-auto xl:w-[360px] xl:max-w-none xl:shrink-0 xl:shadow-none">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] leading-snug font-semibold">{nome}</h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {empresa.cnpj} · cliente desde {clienteDesde}
            </p>
          </div>
          <Link
            href={fecharHref}
            scroll={false}
            aria-label="Fechar painel"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/painel/enviar?empresa=${empresa.id}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] bg-primary px-2.5 text-[13px] font-medium text-primary-foreground hover:brightness-110"
          >
            <Upload className="size-3.5" />
            Enviar documento
          </Link>
          <EditCompanyButton company={empresa} comRotulo />
        </div>

        <MapaAnoMini estados={mapa} ano={ano} />

        <section>
          <Titulo>Em aberto · {formatCurrency(totalAberto)}</Titulo>
          {guias.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhuma guia em aberto.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              {guias.map((g) => (
                <div key={g.id} className="flex items-center gap-2 border-t px-3 py-2 first:border-t-0">
                  <span className={cn("size-[7px] shrink-0 rounded-full", PONTO[g.tom])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{g.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{g.situacao}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">
                    {g.valor != null ? formatCurrency(g.valor) : "—"}
                  </span>
                </div>
              ))}
              {qtdAberto > guias.length ? (
                <Link
                  href={`/painel/documentos?company=${empresa.id}`}
                  className="block border-t px-3 py-1.5 text-xs font-medium text-primary hover:underline"
                >
                  + {qtdAberto - guias.length} em aberto
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section>
          <Titulo
            extra={
              <Link
                href={`/painel/historico?empresa=${empresa.id}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver tudo
              </Link>
            }
          >
            Últimos contatos
          </Titulo>
          {contatos.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhum contato registrado ainda.</p>
          ) : (
            <ol className="relative ml-[3px] border-l">
              {contatos.map((c) => (
                <li key={c.chave} className="relative flex items-start gap-2 pb-2.5 pl-3 last:pb-0">
                  <span
                    className={cn(
                      "absolute top-[5px] -left-[4px] size-[7px] rounded-full ring-2 ring-card",
                      PONTO[c.tom],
                    )}
                  />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    {c.texto}
                    {c.detalhe ? <span className="text-muted-foreground"> · {c.detalhe}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400 tabular-nums">{c.quando}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <Titulo>Pessoas com acesso · {pessoas.length}</Titulo>
          <div className="flex flex-col gap-2">
            {pessoas.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Ninguém tem acesso ao portal desta empresa.</p>
            ) : (
              pessoas.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
                    {iniciais(p.nome)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{p.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.email ?? "sem e-mail"}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "text-xs",
                        p.alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                      )}
                    >
                      {p.acessoTexto}
                    </span>
                    {p.convidar ? (
                      <ConvidarAcessoButton
                        action={convidarAcesso.bind(null, p.id)}
                        hasEmail={!!p.email}
                        hasPhone={telefoneEmpresa}
                      />
                    ) : null}
                  </span>
                </div>
              ))
            )}
            <span>
              <NewClientButton companies={empresasOpcoes} empresaPadrao={empresa.id} variante="link" />
            </span>
          </div>
        </section>

        <section>
          <Titulo>Configurações do portal</Titulo>
          <div className="flex flex-col divide-y rounded-lg border">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              SJ Rewards
              <CompanyRewardsToggle
                enabled={empresa.rewards_enabled !== false}
                companyName={nome}
                toggleAction={setCompanyRewardsEnabled.bind(null, empresa.id)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              Converse com sua empresa
              <CompanyChatToggle
                enabled={empresa.chat_enabled !== false}
                companyName={nome}
                toggleAction={setCompanyChatEnabled.bind(null, empresa.id)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              <span>
                Assistente IA
                <span className="block text-xs text-muted-foreground">
                  {limiteIa === 0 ? "Sem limite" : `Limite ${limiteIa} perguntas/mês`} · usou {usoIa}
                </span>
              </span>
              <CompanyAiLimit
                value={empresa.ai_monthly_limit ?? null}
                companyName={nome}
                saveAction={setCompanyAiLimit.bind(null, empresa.id)}
              />
            </div>
          </div>
        </section>

        <div className="mt-auto border-t pt-3">
          <ConfirmDeleteButton
            action={deleteCompany.bind(null, empresa.id)}
            title="Apagar empresa?"
            confirmLabel="Apagar empresa"
            successMessage="Empresa apagada do sistema."
            triggerLabel="Apagar empresa"
            description={
              <>
                A empresa <strong>{nome}</strong>
                {empresa.cnpj ? ` (${empresa.cnpj})` : ""} será removida com todos os
                boletos, documentos, histórico de faturamento e o acesso dos clientes
                vinculados. Esta ação não pode ser desfeita.
              </>
            }
          />
        </div>
      </aside>
    </>
  );
}
