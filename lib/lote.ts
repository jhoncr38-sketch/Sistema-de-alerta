import { TIPOS_GUIA } from "@/lib/ai/ler-guia";
import { getUserAndProfile } from "@/lib/auth";
import { normalizeCompetencia } from "@/lib/dates";
import type { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

/**
 * Regras do ENVIO EM LOTE de guias (painel do contador): encaixar a guia no
 * cliente pelo CNPJ/CPF, avisar duplicidade e validar os campos antes de
 * publicar. Usado pelas rotas /api/lote/*.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Tamanho máximo de cada PDF (igual ao envio avulso). */
export const LOTE_MAX_BYTES = 10 * 1024 * 1024;

/** Resultado da leitura de um PDF, devolvido para a tela de conferência. */
export interface AnaliseGuia {
  ok: boolean;
  erro?: string;
  documento: string | null;
  companyId: string | null;
  tipo: DocType | null;
  descricao: string | null;
  competencia: string | null;
  valor: number | null;
  vencimento: string | null;
  /** Já existe guia do mesmo tipo/competência para o cliente. */
  duplicada: string | null;
  /** Avisos para conferir (ex.: competência estimada pelo vencimento). */
  notas: string[];
}

/** Só contador (admin ativo) usa o lote. Retorna o profile ou null. */
export async function contadorLogado() {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile || profile.role !== "admin" || profile.active === false) {
    return null;
  }
  return profile;
}

/**
 * Acha o cliente ativo pelo CNPJ/CPF (só dígitos). 1º o documento principal
 * que a IA apontou; se não bater, procura entre TODOS os números do PDF
 * (inteiros e, por último, a raiz de 8 dígitos do CNPJ). Só aceita quando dá
 * UM cliente — na dúvida, devolve null e o contador escolhe.
 */
export async function clientePorDocumento(
  supabase: Supabase,
  documento: string | null,
  documentos: string[] = [],
): Promise<string | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, cnpj")
    .eq("active", true);
  const clientes = (data ?? []).map((c) => ({
    id: c.id as string,
    doc: String(c.cnpj ?? "").replace(/\D/g, ""),
  }));
  const unico = (ids: string[]) => {
    const u = [...new Set(ids)];
    return u.length === 1 ? u[0] : null;
  };

  if (documento) {
    const exato = clientes.find((c) => c.doc === documento);
    if (exato) return exato.id;
  }
  const inteiros = documentos.filter((d) => d.length !== 8);
  const porInteiro = unico(
    clientes.filter((c) => inteiros.includes(c.doc)).map((c) => c.id),
  );
  if (porInteiro) return porInteiro;
  const raizes = documentos
    .filter((d) => d.length === 8 || d.length === 14)
    .map((d) => d.slice(0, 8));
  return unico(
    clientes
      .filter((c) => c.doc.length === 14 && raizes.includes(c.doc.slice(0, 8)))
      .map((c) => c.id),
  );
}

/** Competência = mês anterior ao vencimento (regra usual das guias mensais). */
export function competenciaPeloVencimento(vencimento: string): string {
  const [y, m] = vencimento.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Texto do aviso se o cliente já tem guia do mesmo tipo e competência. */
export async function avisoDuplicada(
  supabase: Supabase,
  companyId: string,
  tipo: DocType,
  competencia: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, status, amount")
    .eq("company_id", companyId)
    .eq("type", tipo)
    .eq("competencia", normalizeCompetencia(competencia))
    .in("categoria", ["boleto", "parcelamento"])
    .limit(1);
  const d = data?.[0];
  if (!d) return null;
  return d.status === "paid"
    ? "Já existe uma guia igual (paga) para este cliente neste mês."
    : "Já existe uma guia igual (em aberto) para este cliente neste mês.";
}

/** Campos que a tela manda para publicar uma guia. */
export interface GuiaParaPublicar {
  companyId: string;
  tipo: DocType;
  descricao: string | null;
  competencia: string;
  valor: number;
  vencimento: string;
  exigeComprovante: boolean;
}

/** Valida os campos vindos do formulário. Retorna o erro ou os dados limpos. */
export function validarGuia(fd: FormData): { erro: string } | { guia: GuiaParaPublicar } {
  const companyId = String(fd.get("companyId") ?? "");
  const tipo = String(fd.get("tipo") ?? "") as DocType;
  const descricao = String(fd.get("descricao") ?? "").trim().slice(0, 120) || null;
  const competencia = normalizeCompetencia(String(fd.get("competencia") ?? ""));
  const valor = Number(String(fd.get("valor") ?? "").replace(",", "."));
  const vencimento = String(fd.get("vencimento") ?? "");

  if (!companyId) return { erro: "Escolha o cliente." };
  if (!(TIPOS_GUIA as readonly string[]).includes(tipo)) return { erro: "Escolha o tipo da guia." };
  if (tipo === "outro" && !descricao) return { erro: "Descreva a guia (tipo “Outro”)." };
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(competencia)) return { erro: "Competência inválida (MM/AAAA)." };
  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Valor inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Vencimento inválido." };

  return {
    guia: {
      companyId,
      tipo,
      descricao: tipo === "outro" ? descricao : null,
      competencia,
      valor: Math.round(valor * 100) / 100,
      vencimento,
      exigeComprovante: fd.get("exigeComprovante") === "1",
    },
  };
}

/** Confere se o arquivo é um PDF aceitável. Retorna o erro ou null. */
export function erroDoArquivo(file: unknown): string | null {
  if (!(file instanceof File) || file.size === 0) return "Arquivo vazio.";
  if (file.type && file.type !== "application/pdf") return "Só PDF.";
  if (file.size > LOTE_MAX_BYTES) return "Arquivo muito grande (máx. 10MB).";
  return null;
}
