/**
 * Atividades do PGDAS-D (Simples Nacional) — tabela FIXA da Receita, a mesma
 * lista do programa do PGDAS-D. Fonte: "Dados de domínio" do Integra Contador
 * (integra-sn/pgdasd/dados_de_dominio). O `id` é o `idAtividade` do serviço
 * TRANSDECLARACAO11.
 *
 * Na tela a lista é organizada por ANEXO da LC 123/2006 (como o contador pensa).
 *
 * O que cada marca significa — tudo conferido em simulação na Receita:
 *   • `st`             comércio/indústria "com substituição tributária": é
 *                      obrigatório dizer, por parcela, o que é substituído ou
 *                      monofásico (ICMS e/ou PIS/COFINS). Sem isso ela recusa.
 *   • `outroMunicipio` ISS devido a outro município: cada parcela leva o código
 *                      do município (tabela TOM/SIAFI) e a UF.
 *   • `exterior`       a receita entra como mercado externo.
 *   • `fatorR`         a Receita pede a folha de salários dos meses que não tem
 *                      e decide sozinha entre o Anexo III e o V.
 * Transporte/comunicação "com ST de ICMS" (35, 37) e escritório contábil com
 * ISS fixo (9, 28) NÃO pedem nada a mais: a Receita já tira o tributo sozinha.
 */

export type AnexoPgdas = "I" | "II" | "III" | "III ou V" | "IV";

export interface AtividadePgdas {
  id: number;
  anexo: AnexoPgdas;
  nome: string;
  st?: boolean;
  outroMunicipio?: boolean;
  exterior?: boolean;
  fatorR?: boolean;
  /** Reservado: motivo para bloquear uma atividade nesta tela (hoje nenhuma). */
  motivo?: string;
}

/** Grupos da lista, na ordem em que aparecem. */
export const ANEXOS_PGDAS: { anexo: AnexoPgdas; titulo: string }[] = [
  { anexo: "I", titulo: "Anexo I — Comércio" },
  { anexo: "II", titulo: "Anexo II — Indústria" },
  { anexo: "III", titulo: "Anexo III — Serviços e locação" },
  { anexo: "III ou V", titulo: "Anexo III ou V — Serviços com fator “r”" },
  { anexo: "IV", titulo: "Anexo IV — Serviços" },
];

export const ATIVIDADES_PGDAS: AtividadePgdas[] = [
  // ----- Anexo I: revenda de mercadorias -----
  { id: 1, anexo: "I", nome: "Revenda de mercadorias · sem substituição tributária" },
  { id: 2, anexo: "I", nome: "Revenda de mercadorias · com substituição tributária/monofásica", st: true },
  { id: 3, anexo: "I", nome: "Revenda de mercadorias · para o exterior", exterior: true },

  // ----- Anexo II: mercadorias industrializadas pelo contribuinte; IPI + ISS -----
  { id: 4, anexo: "II", nome: "Venda de produção própria · sem substituição tributária" },
  { id: 5, anexo: "II", nome: "Venda de produção própria · com substituição tributária/monofásica", st: true },
  { id: 6, anexo: "II", nome: "Venda de produção própria · para o exterior", exterior: true },
  { id: 41, anexo: "II", nome: "Atividade com IPI e ISS · ISS no próprio município" },
  { id: 42, anexo: "II", nome: "Atividade com IPI e ISS · ISS retido" },
  { id: 40, anexo: "II", nome: "Atividade com IPI e ISS · ISS devido a outro município", outroMunicipio: true },
  { id: 43, anexo: "II", nome: "Atividade com IPI e ISS · para o exterior", exterior: true },

  // ----- Anexo III: serviços, locação, transporte e comunicação -----
  { id: 14, anexo: "III", nome: "Serviços do Anexo III · ISS no próprio município" },
  { id: 15, anexo: "III", nome: "Serviços do Anexo III · ISS retido" },
  { id: 13, anexo: "III", nome: "Serviços do Anexo III · ISS devido a outro município", outroMunicipio: true },
  { id: 30, anexo: "III", nome: "Serviços do Anexo III · para o exterior", exterior: true },
  { id: 7, anexo: "III", nome: "Locação de bens móveis" },
  { id: 8, anexo: "III", nome: "Locação de bens móveis · para o exterior", exterior: true },
  { id: 20, anexo: "III", nome: "Construção civil (7.02 e 7.05) do Anexo III · ISS no próprio município" },
  { id: 21, anexo: "III", nome: "Construção civil (7.02 e 7.05) do Anexo III · ISS retido" },
  { id: 19, anexo: "III", nome: "Construção civil (7.02 e 7.05) do Anexo III · ISS devido a outro município", outroMunicipio: true },
  { id: 32, anexo: "III", nome: "Construção civil (7.02 e 7.05) do Anexo III · para o exterior", exterior: true },
  { id: 26, anexo: "III", nome: "Transporte coletivo municipal · ISS no próprio município" },
  { id: 27, anexo: "III", nome: "Transporte coletivo municipal · ISS retido" },
  { id: 25, anexo: "III", nome: "Transporte coletivo municipal · ISS devido a outro município", outroMunicipio: true },
  { id: 34, anexo: "III", nome: "Transporte intermunicipal/interestadual · sem substituição tributária de ICMS" },
  { id: 35, anexo: "III", nome: "Transporte intermunicipal/interestadual · com substituição tributária de ICMS" },
  { id: 38, anexo: "III", nome: "Transporte intermunicipal/interestadual · para o exterior", exterior: true },
  { id: 36, anexo: "III", nome: "Comunicação · sem substituição tributária de ICMS" },
  { id: 37, anexo: "III", nome: "Comunicação · com substituição tributária de ICMS" },
  { id: 39, anexo: "III", nome: "Comunicação · para o exterior", exterior: true },
  { id: 9, anexo: "III", nome: "Escritório contábil com ISS fixo (pago em guia do município)" },
  { id: 28, anexo: "III", nome: "Escritório contábil com ISS fixo · para o exterior", exterior: true },

  // ----- Anexo III ou V: serviços sujeitos ao fator "r" -----
  { id: 11, anexo: "III ou V", nome: "Serviços com fator “r” · ISS no próprio município", fatorR: true },
  { id: 12, anexo: "III ou V", nome: "Serviços com fator “r” · ISS retido", fatorR: true },
  { id: 10, anexo: "III ou V", nome: "Serviços com fator “r” · ISS devido a outro município", fatorR: true, outroMunicipio: true },
  { id: 29, anexo: "III ou V", nome: "Serviços com fator “r” · para o exterior", fatorR: true, exterior: true },

  // ----- Anexo IV: serviços com CPP fora do DAS -----
  { id: 17, anexo: "IV", nome: "Serviços do Anexo IV · ISS no próprio município" },
  { id: 18, anexo: "IV", nome: "Serviços do Anexo IV · ISS retido" },
  { id: 16, anexo: "IV", nome: "Serviços do Anexo IV · ISS devido a outro município", outroMunicipio: true },
  { id: 31, anexo: "IV", nome: "Serviços do Anexo IV · para o exterior", exterior: true },
  { id: 23, anexo: "IV", nome: "Construção civil (7.02 e 7.05) do Anexo IV · ISS no próprio município" },
  { id: 24, anexo: "IV", nome: "Construção civil (7.02 e 7.05) do Anexo IV · ISS retido" },
  { id: 22, anexo: "IV", nome: "Construção civil (7.02 e 7.05) do Anexo IV · ISS devido a outro município", outroMunicipio: true },
  { id: 33, anexo: "IV", nome: "Construção civil (7.02 e 7.05) do Anexo IV · para o exterior", exterior: true },
];

const POR_ID = new Map(ATIVIDADES_PGDAS.map((a) => [a.id, a]));

export function atividadePgdas(id: number): AtividadePgdas | undefined {
  return POR_ID.get(id);
}

/** "Anexo III · Serviços do Anexo III · ISS no próprio município" sem repetir o anexo. */
export function nomeAtividadePgdas(id: number): string {
  const a = POR_ID.get(id);
  if (!a) return `Atividade ${id}`;
  return a.nome.includes(`Anexo ${a.anexo}`) ? a.nome : `Anexo ${a.anexo} · ${a.nome}`;
}

/** Tributos do Simples Nacional (códigos do Integra Contador). */
export const TRIBUTOS_PGDAS: Record<number, string> = {
  1001: "IRPJ",
  1002: "CSLL",
  1004: "COFINS",
  1005: "PIS/Pasep",
  1006: "INSS/CPP",
  1007: "ICMS",
  1008: "IPI",
  1010: "ISS",
};

export const TRIBUTO_COFINS = 1004;
export const TRIBUTO_PIS = 1005;
export const TRIBUTO_ICMS = 1007;

/**
 * Qualificações aceitas nas atividades "com substituição tributária" (2 e 5),
 * conferidas em simulação: ICMS aceita ST ou antecipação; PIS/COFINS aceitam
 * monofásica ou ST. (ICMS monofásico e ST de IRPJ/IPI a Receita recusa.)
 */
export const QUALIF_ICMS: { id: number; nome: string }[] = [
  { id: 8, nome: "Substituição tributária" },
  { id: 10, nome: "Antecipação com encerramento de tributação" },
];
export const QUALIF_PIS_COFINS: { id: number; nome: string }[] = [
  { id: 9, nome: "Tributação monofásica" },
  { id: 8, nome: "Substituição tributária" },
];

export function nomeQualificacao(lista: { id: number; nome: string }[], id: number | null | undefined): string | null {
  return lista.find((q) => q.id === id)?.nome ?? null;
}
