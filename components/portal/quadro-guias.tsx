import {
  BaixarGuiaAcao,
  JaPagueiAcao,
  PedirSegundaViaAcao,
} from "@/components/portal/acoes-guia";
import { formatCurrency } from "@/lib/format";
import { SITUACAO_COR, type Situacao } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** Guia em aberto pronta para o Início (o servidor já calculou os textos). */
export interface GuiaQuadro {
  id: string;
  situacao: Exclude<Situacao, "pago">;
  nome: string;
  valor: number | null;
  meta: string;
  exigeComprovante: boolean;
  /** Tem PDF do boleto para baixar. */
  temArquivo: boolean;
  /** Parcela de débito automático: não pede ação de pagamento. */
  debitoAutomatico: boolean;
}

function Cartao({ g }: { g: GuiaQuadro }) {
  const cor = SITUACAO_COR[g.situacao];
  const atrasado = g.situacao === "precisa";
  const comContador = g.situacao === "contador";
  // Débito automático em dia não pede nada; o que não caiu pede 2ª via.
  const comAcoes = !comContador && (!g.debitoAutomatico || atrasado);

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-4",
        atrasado && "border-red-200 dark:border-red-900/60",
        comContador && "opacity-85",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-xs font-medium", cor.text)}>
        <span className={cn("size-[7px] shrink-0 rounded-full", cor.dot)} />
        {cor.label}
      </span>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold">{g.nome}</span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {g.valor != null ? formatCurrency(g.valor) : "—"}
        </span>
      </div>
      <div
        className={cn(
          "text-[13px]",
          atrasado ? "text-red-700 dark:text-red-400" : "text-muted-foreground",
        )}
      >
        {g.meta}
      </div>
      {comAcoes ? (
        <div className="mt-3 flex items-center gap-3">
          {atrasado ? (
            <PedirSegundaViaAcao docId={g.id} />
          ) : g.temArquivo ? (
            <BaixarGuiaAcao docId={g.id} />
          ) : (
            <span className="flex-1" />
          )}
          {!g.debitoAutomatico ? (
            <JaPagueiAcao docId={g.id} exigeComprovante={g.exigeComprovante} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Início (redesenho 12a): todas as guias em aberto numa grade única, da mais
 * urgente para a menos (atrasado → a pagar → com o contador). A situação vira
 * a etiqueta no topo de cada cartão.
 */
export function GradeGuias({ guias }: { guias: GuiaQuadro[] }) {
  if (guias.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        Tudo em dia! Você não tem guias em aberto.
      </div>
    );
  }
  return (
    <div className="grid items-start gap-2.5 sm:grid-cols-2 sm:gap-3.5 min-[68.75rem]:grid-cols-4">
      {guias.map((g) => (
        <Cartao key={g.id} g={g} />
      ))}
    </div>
  );
}
