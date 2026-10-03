import type { ReactNode } from "react";
import {
  AssistenteHeaderButton,
  type AssistenteTela,
} from "@/components/assistente-chat";
import { CompanyMenu } from "@/components/portal/company-menu";
import { getClientCompanyContext } from "@/lib/companies";
import { getAlertasEmpresas } from "@/lib/portal-alertas";

/**
 * Cabeçalho das páginas do portal do cliente: título à esquerda; à direita o
 * "Dúvidas?" (assistente) e o seletor de empresa. Substitui o PageHeader nas
 * telas do cliente — o seletor saiu da barra lateral e mora aqui.
 */
export async function PortalHeader({
  title,
  subtitle,
  tela = "geral",
  empresaSobTitulo = false,
  assistente = true,
  children,
}: {
  title: string;
  /** Linha discreta sob o título (só na tela Início). */
  subtitle?: string;
  /** Contexto do assistente (sugestões da tela). */
  tela?: AssistenteTela;
  /** Início: no celular, a empresa vai para baixo do título (no lugar da
   *  data) e o seletor da direita some. */
  empresaSobTitulo?: boolean;
  /** false: sem o "Dúvidas?" (ex.: na própria conversa com a IA). */
  assistente?: boolean;
  /** Ações extras antes do "Dúvidas?". */
  children?: ReactNode;
}) {
  const { companies, active } = await getClientCompanyContext();
  const alertas = await getAlertasEmpresas(companies.map((c) => c.id));
  const empresas = companies.map((c) => ({
    id: c.id,
    nome: c.nome_fantasia || c.razao_social,
  }));

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p
            className={
              empresaSobTitulo
                ? "hidden truncate text-xs text-muted-foreground md:block"
                : "truncate text-xs text-muted-foreground"
            }
          >
            {subtitle}
          </p>
        ) : null}
        {empresaSobTitulo ? (
          <div className="mt-0.5 md:hidden">
            <CompanyMenu
              empresas={empresas}
              activeId={active?.id ?? null}
              alertas={alertas}
              variante="texto"
            />
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-3">
        {children}
        {assistente ? <AssistenteHeaderButton tela={tela} /> : null}
        <div className={empresaSobTitulo ? "hidden md:block" : undefined}>
          <CompanyMenu
            empresas={empresas}
            activeId={active?.id ?? null}
            alertas={alertas}
          />
        </div>
      </div>
    </header>
  );
}
