import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentWithCompany } from "@/lib/types";

const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function mesLabel(competencia: string | null): string {
  if (!competencia) return "Sem competência";
  const m = competencia.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return competencia;
  return `${MESES_LONGOS[Number(m[1]) - 1] ?? m[1]} / ${m[2]}`;
}

/** Nome do arquivo sem a extensão, para exibir limpo. */
function nomeArquivo(d: DocumentWithCompany): string {
  return d.file_name.replace(/\.[^.]+$/, "");
}

/**
 * Lista a folha agrupada por mês (competência): um cartão por mês com os
 * arquivos daquele mês dentro. Mantém a tela do cliente limpa mesmo com
 * vários anexos (folha, recibo, frequência...).
 */
export function FolhaList({
  documents,
}: {
  documents: DocumentWithCompany[];
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhuma folha disponível. Quando seu contador publicar a folha do mês,
        ela aparece aqui.
      </div>
    );
  }

  // Agrupa por competência preservando a ordem recebida (já vem mais recente
  // primeiro).
  const grupos: { competencia: string | null; docs: DocumentWithCompany[] }[] =
    [];
  const indexByKey = new Map<string, number>();
  for (const d of documents) {
    const key = d.competencia ?? "—";
    let i = indexByKey.get(key);
    if (i === undefined) {
      i = grupos.length;
      indexByKey.set(key, i);
      grupos.push({ competencia: d.competencia, docs: [] });
    }
    grupos[i].docs.push(d);
  }

  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div
          key={g.competencia ?? "—"}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
            <div className="font-medium">{mesLabel(g.competencia)}</div>
            <div className="text-xs text-muted-foreground">
              {g.docs.length} {g.docs.length === 1 ? "arquivo" : "arquivos"}
            </div>
          </div>
          <ul className="divide-y">
            {g.docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{nomeArquivo(d)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a href={`/api/documents/${d.id}/download`}>
                      <Download />
                      Baixar
                    </a>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
