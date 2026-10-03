"use client";

import { useState } from "react";
import {
  CalendarDays,
  Download,
  FileText,
  Plane,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { FilePreviewButton } from "@/components/file-preview-button";
import { MapaAno, type EstadoMes } from "@/components/portal/mapa-ano";
import { mesAnoLabel } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** Arquivo da folha pronto para a tela. */
export interface FolhaArquivo {
  id: string;
  nome: string; // sem extensão
  extensao: string; // "PDF"
  compKey: string; // "YYYY-MM"
  publicadoEm: string; // "28/09"
  novo: boolean; // cliente ainda não abriu
}

/** Ícone pelo nome do arquivo (recibo, frequência, férias...). */
function iconeDoArquivo(nome: string): LucideIcon {
  const n = nome.toLowerCase();
  if (n.includes("recibo") || n.includes("holerite") || n.includes("contracheque")) return Receipt;
  if (n.includes("frequ") || n.includes("ponto")) return CalendarDays;
  if (n.includes("féria") || n.includes("ferias")) return Plane;
  return FileText;
}

/**
 * Folha de pagamento (redesenho 11a): mapa do ano com as folhas publicadas e a
 * lista compacta dos arquivos do mês escolhido, com "Baixar tudo" (zip).
 */
export function FolhaView({
  arquivos,
  mesAtual,
}: {
  arquivos: FolhaArquivo[];
  /** "YYYY-MM" de hoje (fuso do Brasil). */
  mesAtual: string;
}) {
  const meses = [...new Set(arquivos.map((a) => a.compKey))].sort();
  const ultimo = meses[meses.length - 1] ?? null;
  const [ano, setAno] = useState(Number((ultimo ?? mesAtual).slice(0, 4)));
  const [mes, setMes] = useState<number | null>(
    ultimo ? Number(ultimo.slice(5, 7)) : null,
  );

  const anos = [...new Set([...meses.map((m) => Number(m.slice(0, 4))), Number(mesAtual.slice(0, 4))])].sort(
    (a, b) => b - a,
  );

  const estados: EstadoMes[] = Array.from({ length: 12 }, (_, i) => {
    const key = `${ano}-${String(i + 1).padStart(2, "0")}`;
    if (meses.includes(key)) return "pago";
    if (key === mesAtual) return "preparo";
    return "vazio";
  });
  const disponiveis = estados.filter((e) => e === "pago").length;

  const mesKey = mes ? `${ano}-${String(mes).padStart(2, "0")}` : null;
  const doMes = mesKey ? arquivos.filter((a) => a.compKey === mesKey) : [];

  return (
    <div className="flex flex-col gap-3">
      {anos.length > 1 ? (
        <div className="flex justify-end">
          <select
            aria-label="Ano"
            value={ano}
            onChange={(e) => {
              const novo = Number(e.target.value);
              setAno(novo);
              const ult = meses.filter((m) => m.startsWith(String(novo))).pop();
              setMes(ult ? Number(ult.slice(5, 7)) : null);
            }}
            className="h-8 rounded-lg border bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <MapaAno
        rotulo={`Folhas de ${ano}`}
        valor={`${disponiveis} de 12`}
        estados={estados}
        selecionado={mes}
        onSelecionar={setMes}
        legenda={[
          { estado: "pago", texto: "Disponível" },
          { estado: "preparo", texto: "Em preparo" },
          { estado: "vazio", texto: "A vir" },
        ]}
      />

      {mesKey === null ? (
        <div className="rounded-[10px] border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          {arquivos.length === 0
            ? "Nenhuma folha disponível. Quando seu contador publicar a folha do mês, ela aparece aqui."
            : "Escolha um mês no mapa para ver os arquivos."}
        </div>
      ) : doMes.length === 0 ? (
        <div className="rounded-[10px] border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          {mesKey === mesAtual
            ? `A folha de ${mesAnoLabel(mesKey).toLowerCase()} está em preparo.`
            : `Nenhum arquivo em ${mesAnoLabel(mesKey).toLowerCase()}.`}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border bg-card">
          <div className="flex h-[42px] items-center justify-between gap-3 border-b bg-neutral-50 px-3.5 dark:bg-muted/40">
            <span className="text-sm">
              <strong className="font-semibold">{mesAnoLabel(mesKey)}</strong>
              <span className="hidden text-muted-foreground sm:inline">
                {" "}· {doMes.length} {doMes.length === 1 ? "arquivo" : "arquivos"}
              </span>
            </span>
            <a
              href={`/api/documents/zip?nome=folha-${mesKey}&ids=${doMes.map((a) => a.id).join(",")}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary sm:h-7 sm:rounded-[7px] sm:border sm:bg-card sm:px-2.5 sm:text-foreground sm:hover:bg-muted"
            >
              <Download className="hidden size-3.5 sm:block" />
              Baixar tudo
            </a>
          </div>
          {doMes.map((a, i) => {
            const Icone = iconeDoArquivo(a.nome);
            return (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 sm:grid sm:h-[46px] sm:grid-cols-[28px_minmax(0,1fr)_120px_80px] sm:py-0",
                  i > 0 && "border-t",
                )}
              >
                <span className="hidden size-7 items-center justify-center rounded-md bg-muted text-muted-foreground sm:flex">
                  <Icone className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
                  <div className="truncate text-sm font-semibold">{a.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.extensao}
                    {a.novo ? <span className="text-primary"> · novo</span> : null}
                  </div>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  publicado {a.publicadoEm}
                </span>
                <span className="flex shrink-0 items-center justify-end gap-1">
                  <span className="hidden sm:inline-flex">
                    <FilePreviewButton docId={a.id} fileName={a.nome} iconOnly />
                  </span>
                  <a
                    href={`/api/documents/${a.id}/download`}
                    title="Baixar"
                    aria-label={`Baixar ${a.nome}`}
                    className="inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Download className="size-4" />
                  </a>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
