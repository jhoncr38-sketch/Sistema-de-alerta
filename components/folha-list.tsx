import { FolhaMonth } from "@/components/folha-month";
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

/**
 * Lista a folha agrupada por mês (competência): um cartão recolhível por mês
 * com os arquivos daquele mês dentro. O mês mais recente já vem aberto.
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

  // Agrupa por competência preservando a ordem recebida (mais recente primeiro).
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
      {grupos.map((g, i) => (
        <FolhaMonth
          key={g.competencia ?? "—"}
          titulo={mesLabel(g.competencia)}
          docs={g.docs}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}
