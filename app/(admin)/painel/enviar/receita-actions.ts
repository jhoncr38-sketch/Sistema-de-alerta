"use server";

import { requireAdmin } from "@/lib/auth";
import { serproConfigurado } from "@/lib/serpro/auth";
import { consultarSituacaoFiscal } from "@/lib/serpro/sitfis";
import {
  lerSitfis,
  textoDoPdf,
  type DebitoSitfis,
  type SecaoTexto,
} from "@/lib/serpro/sitfis-leitura";
import { createClient } from "@/lib/supabase/server";

export interface DebitoNaTela extends DebitoSitfis {
  /** Já existe guia dessa competência publicada no portal (DAS ou DARF). */
  noPortal: "aberto" | "pago" | null;
}

export interface Pendencias {
  ok: boolean;
  erro?: string;
  debitos: DebitoNaTela[];
  omissoes: string[];
  outras: SecaoTexto[];
  pgfn: { semPendencias: boolean; secoes: SecaoTexto[] };
  /** PDF do relatório (para abrir na tela sem gerar de novo). */
  pdfBase64?: string;
}

const VAZIO: Omit<Pendencias, "ok" | "erro"> = {
  debitos: [],
  omissoes: [],
  outras: [],
  pgfn: { semPendencias: false, secoes: [] },
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Painel da Receita — "Verificar pendências": gera o Relatório de Situação
 * Fiscal (fonte oficial dos débitos) e lê, de forma exata, os débitos em aberto,
 * as omissões de declaração e as demais pendências. Só leitura: não publica nada.
 */
export async function verificarPendencias(companyId: string): Promise<Pendencias> {
  await requireAdmin();
  if (!serproConfigurado()) {
    return { ok: false, erro: "Integração com a Receita não configurada.", ...VAZIO };
  }
  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ);
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  const contribuinte = digits(company?.cnpj);
  if (!contratante || contribuinte.length !== 14) {
    return { ok: false, erro: "Cliente sem CNPJ cadastrado.", ...VAZIO };
  }

  const r = await consultarSituacaoFiscal({
    contratanteCnpj: contratante,
    autorCnpj: contratante,
    contribuinteCnpj: contribuinte,
  });
  if (!r.ok || !r.pdfBase64) {
    return { ok: false, erro: r.erro ?? "A Receita não devolveu o relatório.", ...VAZIO };
  }

  let leitura;
  try {
    leitura = lerSitfis(await textoDoPdf(r.pdfBase64));
  } catch (err) {
    console.error("[sitfis] leitura falhou:", err);
    return {
      ok: false,
      erro: "Não consegui ler o relatório. Abra a situação fiscal completa abaixo.",
      ...VAZIO,
    };
  }

  // Guias já publicadas no portal, por competência (MM/AAAA).
  const { data: docs } = await supabase
    .from("documents")
    .select("competencia, status, type")
    .eq("company_id", companyId)
    .in("categoria", ["boleto", "parcelamento"]);
  const noPortal = new Map<string, "aberto" | "pago">();
  for (const d of docs ?? []) {
    if (!d.competencia) continue;
    const chave = `${d.type === "das" ? "das" : "outro"}|${d.competencia}`;
    if (d.status === "paid") noPortal.set(chave, "pago");
    else if (!noPortal.has(chave)) noPortal.set(chave, "aberto");
  }

  // Competência (MM/AAAA) em que a guia seria publicada: a do DAS (mensal) ou
  // a da declaração DCTFWeb (trimestre → último mês do trimestre).
  const competenciaDe = (aaaamm: string | null) =>
    aaaamm ? `${aaaamm.slice(4, 6)}/${aaaamm.slice(0, 4)}` : null;
  const debitos: DebitoNaTela[] = leitura.debitos
    .map((d) => {
      const comp = competenciaDe(d.tipo === "simples" ? d.periodoMensal : d.periodoDctf);
      const chave = `${d.tipo === "simples" ? "das" : "outro"}|${comp}`;
      return { ...d, noPortal: comp ? (noPortal.get(chave) ?? null) : null };
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    ok: true,
    debitos,
    omissoes: leitura.omissoes,
    outras: leitura.outras,
    pgfn: leitura.pgfn,
    pdfBase64: r.pdfBase64,
  };
}
