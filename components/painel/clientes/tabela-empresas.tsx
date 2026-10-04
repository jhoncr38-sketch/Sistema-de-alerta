"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, FileDown, Loader2, Megaphone, Search, X } from "lucide-react";
import { toast } from "sonner";
import { createAvisoLote } from "@/app/actions/avisos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LinhaEmpresa {
  id: string;
  nome: string;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  vencidos: number;
  emAberto: number;
  /** "hoje", "há 22 dias", "nunca". */
  acessoTexto: string;
  acessoIso: string | null;
  /** 30+ dias sem entrar (com acesso já feito antes). */
  semAcesso30: boolean;
  /** Ninguém da empresa entrou no portal. */
  nunca: boolean;
  inativa: boolean;
  /** Texto para a busca: nome, razão, CNPJ, pessoas e e-mails. */
  busca: string;
}

export type FiltroEmpresas = "vencidos" | "sem-acesso" | "nunca";

const FILTROS: { key: FiltroEmpresas; rotulo: string; ponto: string }[] = [
  { key: "vencidos", rotulo: "Com vencidos", ponto: "bg-red-600" },
  { key: "sem-acesso", rotulo: "Sem acesso 30+ dias", ponto: "bg-neutral-400" },
  { key: "nunca", rotulo: "Nunca acessou", ponto: "bg-neutral-400" },
];

const COLUNAS = "md:grid-cols-[16px_minmax(0,1fr)_150px_110px_120px_20px]";

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function passa(l: LinhaEmpresa, f: FiltroEmpresas | null): boolean {
  if (f === "vencidos") return l.vencidos > 0;
  if (f === "sem-acesso") return l.semAcesso30;
  if (f === "nunca") return l.nunca;
  return true;
}

/** CSV com ";" (abre direto no Excel em português) e BOM para os acentos. */
function baixarCsv(linhas: LinhaEmpresa[]) {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cab = ["Empresa", "CNPJ", "Situação", "Em aberto (R$)", "Último acesso", "E-mail", "Telefone"];
  const corpo = linhas.map((l) =>
    [
      l.nome,
      l.cnpj,
      l.vencidos > 0 ? `${l.vencidos} vencido${l.vencidos > 1 ? "s" : ""}` : "Em dia",
      l.emAberto.toFixed(2).replace(".", ","),
      l.acessoIso ? new Date(l.acessoIso).toLocaleDateString("pt-BR") : "nunca",
      l.email ?? "",
      l.telefone ?? "",
    ]
      .map(esc)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.join(";"), ...corpo].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TabelaEmpresas({
  linhas,
  selecionada,
  filtroInicial,
}: {
  linhas: LinhaEmpresa[];
  /** Empresa aberta no painel lateral (?empresa=). */
  selecionada: string | null;
  filtroInicial: FiltroEmpresas | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroEmpresas | null>(filtroInicial);
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [comunicadoAberto, setComunicadoAberto] = useState(false);

  const contagem = useMemo(
    () =>
      Object.fromEntries(FILTROS.map((f) => [f.key, linhas.filter((l) => passa(l, f.key)).length])) as Record<
        FiltroEmpresas,
        number
      >,
    [linhas],
  );

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    const qDigitos = busca.replace(/\D/g, "");
    return linhas.filter(
      (l) =>
        passa(l, filtro) &&
        (!q || l.busca.includes(q) || (qDigitos.length >= 3 && l.cnpj.replace(/\D/g, "").includes(qDigitos))),
    );
  }, [linhas, filtro, busca]);

  const selecionadas = linhas.filter((l) => marcadas.has(l.id));
  const totalAberto = selecionadas.reduce((s, l) => s + l.emAberto, 0);
  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((l) => marcadas.has(l.id));

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function alternarTodas() {
    setMarcadas((m) => {
      const n = new Set(m);
      if (todasVisiveisMarcadas) visiveis.forEach((l) => n.delete(l.id));
      else visiveis.forEach((l) => n.add(l.id));
      return n;
    });
  }
  function abrir(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set("empresa", id);
    router.push(`/painel/clientes?${p.toString()}`, { scroll: false });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => {
          const on = filtro === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFiltro(on ? null : f.key)}
              className={cn(
                "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                on
                  ? "bg-foreground text-background"
                  : "border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-[7px] rounded-full", f.ponto)} />
              {f.rotulo} {contagem[f.key]}
              {on ? <X className="size-3" /> : null}
            </button>
          );
        })}
        <label className="relative ml-auto w-full sm:w-[200px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Empresa, CNPJ ou pessoa"
            aria-label="Buscar empresa, CNPJ ou pessoa"
            className="h-8 w-full rounded-lg border bg-card pr-2.5 pl-8 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
      </div>

      <section className="overflow-hidden rounded-[10px] border bg-card">
        <div
          className={cn(
            "hidden h-8 items-center gap-3 px-3.5 text-xs text-neutral-400 md:grid",
            COLUNAS,
          )}
        >
          <input
            type="checkbox"
            checked={todasVisiveisMarcadas}
            onChange={alternarTodas}
            aria-label="Selecionar todas"
            className="size-4 rounded accent-primary"
          />
          <span>Empresa</span>
          <span>Situação</span>
          <span className="text-right">Em aberto</span>
          <span>Último acesso</span>
          <span />
        </div>

        {visiveis.length === 0 ? (
          <p className="border-t px-4 py-6 text-center text-[13px] text-muted-foreground">
            {linhas.length === 0
              ? "Nenhuma empresa cadastrada. Use “Nova empresa” para adicionar a primeira."
              : "Nenhuma empresa neste filtro."}
          </p>
        ) : (
          visiveis.map((l) => {
            const ativa = l.id === selecionada;
            return (
              <div
                key={l.id}
                role="button"
                tabIndex={0}
                onClick={() => abrir(l.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    abrir(l.id);
                  }
                }}
                aria-current={ativa ? "true" : undefined}
                className={cn(
                  "grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t px-3.5 py-2.5 transition-colors hover:bg-muted/40 md:h-[50px] md:py-0",
                  COLUNAS,
                  ativa && "bg-primary/5 shadow-[inset_3px_0_0] shadow-primary hover:bg-primary/5",
                  marcadas.has(l.id) && !ativa && "bg-primary/[.03]",
                )}
              >
                <input
                  type="checkbox"
                  checked={marcadas.has(l.id)}
                  onChange={() => alternar(l.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Selecionar ${l.nome}`}
                  className="col-start-1 row-start-1 size-4 rounded accent-primary md:col-start-auto md:row-start-auto"
                />
                <span className="col-start-2 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                  <span className="block truncate text-sm font-semibold">
                    {l.nome}
                    {l.inativa ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inativa)</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">{l.cnpj}</span>
                </span>
                <span
                  className={cn(
                    "col-start-2 row-start-2 flex items-center gap-1.5 text-[13px] md:col-start-auto md:row-start-auto",
                    l.vencidos > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <span
                    className={cn("size-[7px] shrink-0 rounded-full", l.vencidos > 0 ? "bg-red-600" : "bg-emerald-600")}
                  />
                  {l.vencidos > 0 ? `${l.vencidos} vencido${l.vencidos > 1 ? "s" : ""}` : "Em dia"}
                </span>
                <span className="col-start-3 row-start-1 text-right text-sm font-semibold tabular-nums md:col-start-auto md:row-start-auto">
                  {l.emAberto > 0 ? formatCurrency(l.emAberto) : "—"}
                </span>
                <span
                  className={cn(
                    "col-start-3 row-start-2 text-right text-[13px] md:text-left md:col-start-auto md:row-start-auto",
                    l.semAcesso30 || l.nunca ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                  )}
                  title={l.acessoIso ? new Date(l.acessoIso).toLocaleString("pt-BR") : "Ninguém da empresa entrou no portal"}
                >
                  {l.acessoTexto}
                </span>
                <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
              </div>
            );
          })
        )}

        {selecionadas.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 bg-foreground px-4 py-2 text-[13px] text-background">
            <span>
              <strong>{selecionadas.length}</strong>{" "}
              {selecionadas.length === 1 ? "selecionada" : "selecionadas"} · {formatCurrency(totalAberto)} em aberto
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setComunicadoAberto(true)}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-white/10 px-2.5 font-medium hover:bg-white/20"
              >
                <Megaphone className="size-3.5" />
                Comunicado
              </button>
              <button
                type="button"
                onClick={() => baixarCsv(selecionadas)}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-white/10 px-2.5 font-medium hover:bg-white/20"
              >
                <FileDown className="size-3.5" />
                Exportar
              </button>
              <button
                type="button"
                onClick={() => setMarcadas(new Set())}
                aria-label="Limpar seleção"
                className="inline-flex size-[30px] items-center justify-center rounded-[7px] hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </span>
          </div>
        ) : null}
      </section>

      <ComunicadoDialog
        aberto={comunicadoAberto}
        onAberto={setComunicadoAberto}
        empresas={selecionadas}
        onEnviado={() => setMarcadas(new Set())}
      />
    </>
  );
}

function ComunicadoDialog({
  aberto,
  onAberto,
  empresas,
  onEnviado,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  empresas: LinhaEmpresa[];
  onEnviado: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    startTransition(async () => {
      const r = await createAvisoLote({
        companyIds: empresas.map((x) => x.id),
        title: String(fd.get("title") ?? ""),
        message: String(fd.get("message") ?? ""),
        notify: fd.get("notify") === "1",
      });
      if (r.error) {
        setErro(r.error);
        return;
      }
      toast.success(
        `Comunicado enviado para ${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"}.`,
      );
      onAberto(false);
      onEnviado();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onAberto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comunicado</DialogTitle>
          <DialogDescription>
            Aparece no Início do portal de{" "}
            {empresas.length === 1
              ? empresas[0]?.nome
              : `${empresas.length} empresas (cada uma vê o seu)`}
            .
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="aviso-titulo">Título</Label>
            <Input id="aviso-titulo" name="title" required maxLength={120} placeholder="Ex.: Recesso de fim de ano" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aviso-msg">Mensagem</Label>
            <textarea
              id="aviso-msg"
              name="message"
              required
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" value="1" defaultChecked className="size-4 accent-primary" />
            Avisar também por e-mail
          </label>
          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Megaphone />}
              Enviar comunicado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
