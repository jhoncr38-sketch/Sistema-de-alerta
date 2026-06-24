import type { DocCategoria, DocType } from "@/lib/types";

export const APP_NAME = "ContAlert";
export const APP_TAGLINE = "Obrigações Contábeis";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  das: "DAS - Simples Nacional",
  darf_irpj: "DARF - IRPJ",
  darf_piscofins: "DARF - PIS/COFINS",
  gps_inss: "GPS - INSS",
  iss: "ISS",
  fgts: "FGTS",
  folha: "Folha de Pagamento",
  relatorio_fiscal: "Relatório Fiscal",
  outro: "Outro",
};

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as DocType, label }),
);

export const CATEGORIA_LABELS: Record<DocCategoria, string> = {
  boleto: "Boleto a pagar",
  documento: "Documento / Relatório",
};

// Tipos de cada categoria. 'boleto' = guias com pagamento; 'documento' = só leitura.
const BOLETO_TYPES: DocType[] = [
  "das",
  "darf_irpj",
  "darf_piscofins",
  "gps_inss",
  "iss",
  "fgts",
  "outro",
];
const DOCUMENTO_TYPES: DocType[] = ["folha", "relatorio_fiscal", "outro"];

/** Opções de tipo de documento conforme a categoria escolhida no envio. */
export function docTypeOptionsFor(
  categoria: DocCategoria,
): { value: DocType; label: string }[] {
  const types = categoria === "boleto" ? BOLETO_TYPES : DOCUMENTO_TYPES;
  return types.map((value) => ({ value, label: DOC_TYPE_LABELS[value] }));
}

export function docTypeLabel(type: DocType): string {
  return DOC_TYPE_LABELS[type] ?? type;
}

/**
 * Tributos que entram na carga tributária (imposto/faturamento).
 * Exclui FGTS e folha de pagamento, que são encargos, não impostos.
 */
export const TRIBUTO_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  "das",
  "darf_irpj",
  "darf_piscofins",
  "gps_inss",
  "iss",
]);

/** True se o tipo de documento for um tributo (conta na carga tributária). */
export function isTributo(type: DocType): boolean {
  return TRIBUTO_TYPES.has(type);
}
