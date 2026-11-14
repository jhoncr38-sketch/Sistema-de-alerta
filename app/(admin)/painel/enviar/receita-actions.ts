"use server";

import { listarParcelasReceita } from "@/app/(admin)/painel/integracoes/serpro/actions";
import { requireAdmin } from "@/lib/auth";
import { hojeBR } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { mesAnoLabel } from "@/lib/portal";
import { serproConfigurado } from "@/lib/serpro/auth";
import { nomeDoDarf } from "@/lib/serpro/darf-leitura";
import { PARCELAMENTO_SISTEMAS } from "@/lib/serpro/parcelamento";
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

// ============================================================
// "Trazer tudo da Receita" — para UM cliente, monta a lista de guias que dá
// para gerar a partir do que está em aberto: DAS (Simples), DAS-MEI, DARF da
// DCTFWeb (um por declaração/origem) e parcelas de parcelamento. Só leitura —
// quem gera e publica é publicarGuiaDaReceita (integracoes/serpro/actions).
// ============================================================

export type TipoGuiaReceita = "das" | "das_mei" | "darf" | "parcela";

export interface GuiaSugerida {
  /** Única dentro do cliente. */
  chave: string;
  tipo: TipoGuiaReceita;
  /** "DAS Simples Nacional · Setembro 2026" */
  titulo: string;
  /** "Venceu 20/10/2026 · original R$ … · multa e juros R$ …" */
  detalhe: string;
  /** AAAAMM do DAS / DAS-MEI / declaração DCTFWeb. */
  periodo: string | null;
  /** DARF: filtro de origem (8 = MIT, 1 = eSocial). */
  origem: number | null;
  /** DARF: códigos dos tributos que a situação fiscal mostra em aberto. */
  codigos: string[];
  /** Parcela: sistema (PARCSN, PARCMEI...) e mês (AAAAMM). */
  sistema: string | null;
  parcela: number | null;
  /** Valor de hoje (saldo consolidado do relatório) ou o da parcela. */
  valor: number | null;
  vencimento: string | null;
  vencido: boolean;
  /** Já há guia dessa competência no portal (em aberto ou paga). */
  noPortal: "aberto" | "pago" | null;
}

export interface GuiasDaEmpresa {
  companyId: string;
  ok: boolean;
  erro?: string;
  guias: GuiaSugerida[];
  /** O que não vira guia aqui: multas/lançamentos, PGFN, omissões... */
  avisos: string[];
}

const DARF_TYPES_PORTAL = new Set(["darf_irpj", "darf_piscofins", "darf_csll", "gps_inss"]);

/** "AAAAMM" → "MM/AAAA" (formato de competência do sistema). */
const competenciaDoPeriodo = (p: string) => `${p.slice(4, 6)}/${p.slice(0, 4)}`;
/** "AAAAMM" → "Setembro 2026". */
const mesDoPeriodo = (p: string) => mesAnoLabel(`${p.slice(0, 4)}-${p.slice(4, 6)}`);

function detalheDosDebitos(ds: DebitoSitfis[], hoje: string): string {
  const venc = ds.map((d) => d.vencimento).sort()[0];
  const original = ds.reduce((s, d) => s + d.valorOriginal, 0);
  const acrescimos = ds.reduce((s, d) => s + d.multa + d.juros, 0);
  return (
    `${venc < hoje ? "Venceu" : "Vence"} ${formatDate(venc)} · original ${formatCurrency(original)}` +
    (acrescimos > 0 ? ` · multa e juros ${formatCurrency(acrescimos)}` : "")
  );
}

type DocPortal = { type: string; competencia: string | null; status: string; file_name: string | null };

export async function buscarGuiasNaReceita(
  companyId: string,
  incluirParcelas: boolean,
): Promise<GuiasDaEmpresa> {
  const pend = await verificarPendencias(companyId); // requireAdmin + SITFIS
  if (!pend.ok) {
    return { companyId, ok: false, erro: pend.erro, guias: [], avisos: [] };
  }
  const hoje = hojeBR();

  // O que o cliente já tem no portal (para não publicar em dobro sem querer).
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("type, competencia, status, file_name")
    .eq("company_id", companyId)
    .eq("categoria", "boleto");
  const situacao = (pred: (d: DocPortal) => boolean): "aberto" | "pago" | null => {
    let r: "aberto" | "pago" | null = null;
    for (const d of (docs ?? []) as DocPortal[]) {
      if (!pred(d)) continue;
      if (d.status !== "open") return "pago"; // pago ou aguardando confirmação
      r = "aberto";
    }
    return r;
  };

  const guias: GuiaSugerida[] = [];
  const avisos: string[] = [];
  const das = new Map<string, DebitoSitfis[]>();
  const mei = new Map<string, DebitoSitfis[]>();
  const darf = new Map<string, DebitoSitfis[]>();
  const juntar = (m: Map<string, DebitoSitfis[]>, k: string, d: DebitoSitfis) =>
    m.set(k, [...(m.get(k) ?? []), d]);

  for (const d of pend.debitos) {
    if (d.tipo === "simples" && d.periodoMensal) juntar(das, d.periodoMensal, d);
    else if (d.tipo === "mei" && d.periodoMensal) juntar(mei, d.periodoMensal, d);
    else if (d.tipo === "outro" && !d.lancamento && d.periodoDctf)
      juntar(darf, `${d.periodoDctf}|${d.origem ?? ""}`, d);
    else
      avisos.push(
        `${d.receita} · ${d.pa} (${formatCurrency(d.saldoConsolidado)}): ` +
          (d.lancamento
            ? "lançamento/multa — pague pela notificação no e-CAC."
            : "não dá para gerar a guia por aqui."),
      );
  }

  const base = (ds: DebitoSitfis[]) => {
    const vencimento = ds.map((d) => d.vencimento).sort()[0];
    return {
      valor: Math.round(ds.reduce((s, d) => s + d.saldoConsolidado, 0) * 100) / 100,
      vencimento,
      vencido: vencimento < hoje,
      detalhe: detalheDosDebitos(ds, hoje),
    };
  };
  const semExtras = { origem: null, codigos: [], sistema: null, parcela: null };

  for (const [periodo, ds] of das) {
    const comp = competenciaDoPeriodo(periodo);
    guias.push({
      ...semExtras,
      ...base(ds),
      chave: `das|${periodo}`,
      tipo: "das",
      titulo: `DAS Simples Nacional · ${mesDoPeriodo(periodo)}`,
      periodo,
      noPortal: situacao((x) => x.type === "das" && x.competencia === comp),
    });
  }
  for (const [periodo, ds] of mei) {
    const comp = competenciaDoPeriodo(periodo);
    guias.push({
      ...semExtras,
      ...base(ds),
      chave: `mei|${periodo}`,
      tipo: "das_mei",
      titulo: `DAS-MEI · ${mesDoPeriodo(periodo)}`,
      periodo,
      noPortal: situacao((x) => x.type === "das" && x.competencia === comp),
    });
  }
  for (const [k, ds] of darf) {
    const [periodo, origemTxt] = k.split("|");
    const comp = competenciaDoPeriodo(periodo);
    const tributos = nomeDoDarf(
      ds.map((d) => ({ denominacao: d.receita.replace(/^\d{4}-\d{2}\s*-\s*/, "") })),
    );
    guias.push({
      ...semExtras,
      ...base(ds),
      chave: `darf|${k}`,
      tipo: "darf",
      titulo: `${tributos} · ${ds[0].pa}`,
      periodo,
      origem: origemTxt ? Number(origemTxt) : null,
      codigos: [...new Set(ds.map((d) => d.receita.slice(0, 4)))],
      noPortal: situacao(
        (x) =>
          x.competencia === comp &&
          (DARF_TYPES_PORTAL.has(x.type) ||
            (x.type === "outro" && (x.file_name ?? "").startsWith("DARF-"))),
      ),
    });
  }

  if (incluirParcelas) {
    const lp = await listarParcelasReceita(companyId);
    if (!lp.ok) {
      avisos.push(
        `Parcelamentos: ${lp.titulo ?? "não consegui consultar"}${lp.detalhe ? ` — ${lp.detalhe}` : ""}`,
      );
    }
    for (const p of lp.parcelas) {
      const comp = competenciaDoPeriodo(String(p.parcela));
      const sistema = PARCELAMENTO_SISTEMAS.find((s) => s.id === p.sistema);
      guias.push({
        ...semExtras,
        chave: `parcela|${p.sistema}|${p.parcela}`,
        tipo: "parcela",
        titulo: `Parcela ${p.label} · ${sistema?.label ?? p.sistema}`,
        detalhe: "Parcela disponível para emissão na Receita",
        periodo: null,
        sistema: p.sistema,
        parcela: p.parcela,
        valor: p.valor,
        vencimento: null,
        vencido: false,
        noPortal: situacao(
          (x) =>
            x.type === "outro" && x.competencia === comp && (x.file_name ?? "").startsWith("Parcela-"),
        ),
      });
    }
  }

  for (const o of pend.omissoes) avisos.push(`Declaração em falta: ${o}`);
  if (!pend.pgfn.semPendencias && pend.pgfn.secoes.length > 0) {
    avisos.push("Há pendências na PGFN (dívida ativa) — não entram aqui. Veja a situação fiscal do cliente.");
  }
  for (const s of pend.outras) avisos.push(`Outras pendências na Receita: ${s.titulo}`);

  guias.sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"));
  return { companyId, ok: true, guias, avisos };
}
