import { FileText, Landmark, Layers, ShieldCheck, Users, Wallet } from "lucide-react";
import type { DocCategoria, DocType } from "@/lib/types";
import { cn } from "@/lib/utils";

type IconComp = React.ComponentType<{ className?: string }>;

const TRIBUTOS = new Set<DocType>([
  "das",
  "darf_irpj",
  "darf_piscofins",
  "darf_csll",
  "iss",
  "iss_rpa",
  "icms",
]);

/** Ícone + cor de fundo de acordo com o tipo/categoria do documento. */
function visual(doc: { type: DocType; categoria: DocCategoria }): {
  Icon: IconComp;
  box: string;
} {
  if (doc.categoria === "parcelamento") {
    return {
      Icon: Layers,
      box: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
    };
  }
  if (doc.categoria === "folha" || doc.type === "folha") {
    return {
      Icon: Users,
      box: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    };
  }
  if (doc.type === "mensalidade") {
    return {
      Icon: Wallet,
      box: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    };
  }
  if (doc.type === "gps_inss" || doc.type === "fgts") {
    return {
      Icon: ShieldCheck,
      box: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    };
  }
  if (TRIBUTOS.has(doc.type)) {
    return {
      Icon: Landmark,
      box: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
    };
  }
  // Documentos institucionais (CNPJ, contrato, alvará...) e "outro".
  return { Icon: FileText, box: "bg-muted text-muted-foreground" };
}

/** Quadradinho colorido com o ícone do tipo — ajuda o cliente a bater o olho. */
export function DocTypeIcon({
  doc,
  className,
}: {
  doc: { type: DocType; categoria: DocCategoria };
  className?: string;
}) {
  const { Icon, box } = visual(doc);
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        box,
        className,
      )}
    >
      <Icon />
    </span>
  );
}
