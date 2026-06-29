import type { DocCategoria, DocType } from "@/lib/types";

export const APP_NAME = "ContAlert";
export const APP_TAGLINE = "Obrigações Contábeis";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  das: "DAS - Simples Nacional",
  darf_irpj: "DARF - IRPJ",
  darf_piscofins: "DARF - PIS/COFINS",
  darf_csll: "DARF - CSLL",
  gps_inss: "GPS - INSS",
  iss: "ISS",
  iss_rpa: "ISS - RPA",
  icms: "ICMS",
  fgts: "FGTS",
  mensalidade: "Mensalidade da Contabilidade",
  folha: "Folha de Pagamento",
  relatorio_fiscal: "Relatório Fiscal",
  cartao_cnpj: "Cartão CNPJ",
  contrato_social: "Contrato Social",
  licenca: "Licença",
  alvara: "Alvará",
  outro: "Outro",
};

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(
  ([value, label]) => ({ value: value as DocType, label }),
);

export const CATEGORIA_LABELS: Record<DocCategoria, string> = {
  boleto: "Boleto a pagar",
  documento: "Documento da empresa",
  folha: "Folha de pagamento",
  parcelamento: "Parcelamento",
};

/** Categorias disponíveis no formulário de envio avulso (parcelamento tem fluxo próprio). */
export const UPLOAD_CATEGORIAS: DocCategoria[] = ["boleto", "documento", "folha"];

// Tipos de cada categoria:
//  'boleto'    = guias com valor/vencimento/pagamento;
//  'documento' = institucionais, sem periodicidade (CNPJ, contrato, alvará...);
//  'folha'     = folha de pagamento mensal.
const BOLETO_TYPES: DocType[] = [
  "das",
  "darf_irpj",
  "darf_piscofins",
  "darf_csll",
  "gps_inss",
  "iss",
  "iss_rpa",
  "icms",
  "fgts",
  "mensalidade",
  "outro",
];
const DOCUMENTO_TYPES: DocType[] = [
  "cartao_cnpj",
  "contrato_social",
  "licenca",
  "alvara",
  "relatorio_fiscal",
  "outro",
];
const FOLHA_TYPES: DocType[] = ["folha"];

/** Opções de tipo de documento conforme a categoria escolhida no envio. */
export function docTypeOptionsFor(
  categoria: DocCategoria,
): { value: DocType; label: string }[] {
  // Parcelamento usa as mesmas guias de um boleto (DAS, DARFs, INSS, ICMS...).
  const types =
    categoria === "boleto" || categoria === "parcelamento"
      ? BOLETO_TYPES
      : categoria === "folha"
        ? FOLHA_TYPES
        : DOCUMENTO_TYPES;
  return types.map((value) => ({ value, label: DOC_TYPE_LABELS[value] }));
}

export function docTypeLabel(type: DocType): string {
  return DOC_TYPE_LABELS[type] ?? type;
}

// ----- Parcelamentos -----
// A modalidade classifica o parcelamento (não o imposto da guia). "Outro" abre
// um nome livre no formulário. A lista cobre os parcelamentos mais comuns no BR.
export interface ModalidadeOption {
  value: string;
  label: string;
}

export const PARCELAMENTO_MODALIDADES: ModalidadeOption[] = [
  { value: "receita_federal", label: "Receita Federal" },
  { value: "pgfn", label: "PGFN" },
  { value: "municipal", label: "Municipal" },
  { value: "estadual", label: "Estadual" },
  { value: "outro", label: "Outros" },
];

/** Como o parcelamento é pago: boleto mensal ou débito automático. */
export const FORMA_PAGAMENTO_OPTIONS: { value: string; label: string }[] = [
  { value: "boleto", label: "Boleto mensal" },
  { value: "debito_automatico", label: "Débito automático" },
];

const MODALIDADE_LABELS: Record<string, string> = Object.fromEntries(
  PARCELAMENTO_MODALIDADES.map((m) => [m.value, m.label]),
);

export function modalidadeLabel(value: string): string {
  return MODALIDADE_LABELS[value] ?? value;
}

/** doc_type da guia de cada modalidade (alimenta documents.type das parcelas). */
const MODALIDADE_DOCTYPE: Record<string, DocType> = {
  receita_federal: "outro",
  pgfn: "outro",
  municipal: "iss",
  estadual: "icms",
  outro: "outro",
};

export function modalidadeDocType(value: string): DocType {
  return MODALIDADE_DOCTYPE[value] ?? "outro";
}

/**
 * Tributos que entram na carga tributária (imposto/faturamento).
 * Inclui DAS, DARFs, ISS e ICMS.
 * Exclui GPS-INSS, FGTS, folha e ISS-RPA — encargos/retenções que não
 * compõem a carga tributária da empresa.
 */
export const TRIBUTO_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  "das",
  "darf_irpj",
  "darf_piscofins",
  "darf_csll",
  "iss",
  "icms",
]);

/** True se o tipo de documento for um tributo (conta na carga tributária). */
export function isTributo(type: DocType): boolean {
  return TRIBUTO_TYPES.has(type);
}
