"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { setActiveCompany } from "@/app/(client)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EmpresaAlerta } from "@/lib/portal-alertas";
import { cn } from "@/lib/utils";

export interface EmpresaOpcao {
  id: string;
  nome: string;
}

/** Chip de situação da empresa no menu: vencidos / vence em breve / em dia. */
function ChipSituacao({ alerta }: { alerta: EmpresaAlerta | undefined }) {
  if (alerta && alerta.vencidos > 0) {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {alerta.vencidos} {alerta.vencidos === 1 ? "vencido" : "vencidos"}
      </span>
    );
  }
  if (alerta && alerta.venceEmDias !== null) {
    const d = alerta.venceEmDias;
    return (
      <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
        {d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`}
      </span>
    );
  }
  return (
    <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
      Em dia
    </span>
  );
}

/**
 * Seletor de empresa no cabeçalho da página. Com 1 empresa só mostra o nome
 * (sem menu). Com 2+, abre a lista com a situação de cada uma.
 */
export function CompanyMenu({
  empresas,
  activeId,
  alertas,
  variante = "botao",
}: {
  empresas: EmpresaOpcao[];
  activeId: string | null;
  alertas: Record<string, EmpresaAlerta>;
  /** "texto": linha discreta sob o título (Início no celular). */
  variante?: "botao" | "texto";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ativa = empresas.find((e) => e.id === activeId) ?? empresas[0];
  if (!ativa) return null;
  const vencidosAtiva = alertas[ativa.id]?.vencidos ?? 0;

  function trocar(id: string) {
    if (id === ativa?.id) return;
    startTransition(async () => {
      await setActiveCompany(id);
      router.refresh();
    });
  }

  const conteudo = (
    <>
      {pending ? (
        <Loader2 className="size-[15px] shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Building2 className="size-[15px] shrink-0 text-muted-foreground" />
      )}
      <span className="max-w-[16rem] truncate">{ativa.nome}</span>
      {vencidosAtiva > 0 ? (
        <span className="rounded-full bg-red-600 px-[7px] py-px text-[11px] font-semibold text-white tabular-nums">
          {vencidosAtiva}
        </span>
      ) : null}
    </>
  );

  const base =
    "inline-flex h-9 max-w-full items-center gap-2 rounded-[10px] border bg-card px-3 text-sm font-medium";

  if (variante === "texto") {
    const linha = (
      <>
        <Building2 className="size-3 shrink-0" />
        <span className="truncate">{ativa.nome}</span>
      </>
    );
    if (empresas.length < 2) {
      return (
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {linha}
        </div>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="flex max-w-full min-w-0 items-center gap-1 text-xs text-muted-foreground"
        >
          {linha}
          {pending ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            <ChevronDown className="size-3 shrink-0" />
          )}
        </DropdownMenuTrigger>
        <ListaEmpresas
          empresas={empresas}
          ativaId={ativa.id}
          alertas={alertas}
          trocar={trocar}
        />
      </DropdownMenu>
    );
  }

  if (empresas.length < 2) {
    // Uma empresa só: o nome serve de referência no desktop; no celular some.
    return <div className={cn(base, "hidden md:inline-flex")}>{conteudo}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(base, "transition-colors hover:bg-muted disabled:opacity-70")}
      >
        {conteudo}
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <ListaEmpresas
        empresas={empresas}
        ativaId={ativa.id}
        alertas={alertas}
        trocar={trocar}
      />
    </DropdownMenu>
  );
}

/** Lista do menu: cada empresa com o chip de situação. */
function ListaEmpresas({
  empresas,
  ativaId,
  alertas,
  trocar,
}: {
  empresas: EmpresaOpcao[];
  ativaId: string;
  alertas: Record<string, EmpresaAlerta>;
  trocar: (id: string) => void;
}) {
  return (
    <DropdownMenuContent align="end" className="w-72">
      {empresas.map((e) => (
        <DropdownMenuItem
          key={e.id}
          className="gap-2 py-2"
          onClick={() => trocar(e.id)}
        >
          <Check
            className={cn(
              "size-4 shrink-0",
              e.id === ativaId ? "text-primary" : "invisible",
            )}
          />
          <span className="min-w-0 truncate">{e.nome}</span>
          <ChipSituacao alerta={alertas[e.id]} />
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
