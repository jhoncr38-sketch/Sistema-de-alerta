"use server";

import { revalidatePath } from "next/cache";
import { publicarDas } from "@/app/(admin)/painel/integracoes/serpro/actions";
import { requireAdmin } from "@/lib/auth";
import { hojeBR } from "@/lib/dates";
import { serproConfigurado } from "@/lib/serpro/auth";
import MUNICIPIOS from "@/lib/data/municipios-tom.json";
import {
  declararPgdas,
  periodoJaDeclarado,
  ultimaDeclaracaoAntesDe,
  type AtividadeDeclarada,
  type FolhaMes,
  type ValorDevido,
} from "@/lib/serpro/pgdas";
import {
  atividadePgdas,
  nomeAtividadePgdas,
  QUALIF_ICMS,
  QUALIF_PIS_COFINS,
  TRIBUTO_COFINS,
  TRIBUTO_ICMS,
  TRIBUTO_PIS,
} from "@/lib/serpro/pgdas-atividades";
import { createClient } from "@/lib/supabase/server";

/**
 * Declaração mensal do Simples Nacional (PGDAS-D) pelo painel do contador:
 * simular (a Receita só calcula) → conferir → transmitir (com a conferência de
 * valores da própria Receita). Só o contador; o cliente nunca transmite.
 */

/** Uma parcela de receita, como a tela envia. */
export interface LinhaAtividade {
  idAtividade: number;
  valor: number;
  /** ISS devido a outro município: código da tabela oficial (4 dígitos) e UF. */
  municipio?: string;
  uf?: string;
  /** Atividades "com substituição tributária": 8 = ST, 10 = antecipação. */
  icms?: number | null;
  /** Idem para PIS e COFINS juntos: 9 = monofásica, 8 = ST. */
  pisCofins?: number | null;
}

/** Municípios por UF (tabela TOM/SIAFI do Tesouro): [código, nome]. */
const TABELA_MUNICIPIOS = MUNICIPIOS as Record<string, string[][]>;

export interface PgdasPedido {
  companyId: string;
  /** Período de apuração AAAAMM. */
  pa: string;
  /** Vazio = sem movimento. */
  atividades: LinhaAtividade[];
  /** Folha de salários por mês (AAAAMM) — só com atividade de fator “r”. */
  folhas?: FolhaMes[];
}

const PREFIXO_DOC = "Declaração do Simples Nacional (PGDAS-D)";
const centavos = (v: number) => Math.round(v * 100) / 100;
const digitos = (s: string) => s.replace(/\D/g, "");
/** "202609" → "09/2026" (formato de competência do sistema). */
const competenciaDe = (pa: string) => `${pa.slice(4, 6)}/${pa.slice(0, 4)}`;

type Preparado =
  | { erro: string }
  | {
      contratante: string;
      cnpj: string;
      nome: string;
      atividades: AtividadeDeclarada[];
      folhas: FolhaMes[];
      receita: number;
    };

/** Valida o pedido e carrega o cliente. Não fala com a Receita. */
async function preparar(p: PgdasPedido): Promise<Preparado> {
  if (!serproConfigurado()) return { erro: "A integração com a Receita não está configurada." };
  const contratante = digitos(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante) return { erro: "Configure SERPRO_CONTRATANTE_CNPJ." };

  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(p.pa)) return { erro: "Mês inválido." };
  const mesAtual = hojeBR().slice(0, 7).replace("-", "");
  if (p.pa >= mesAtual) return { erro: "Só é possível declarar um mês já encerrado." };

  if (!Array.isArray(p.atividades) || p.atividades.length > 40) {
    return { erro: "Lista de atividades inválida." };
  }
  const atividades: AtividadeDeclarada[] = [];
  const vistos = new Set<string>();
  for (const a of p.atividades) {
    const id = Number(a.idAtividade);
    const valor = centavos(Number(a.valor));
    const def = atividadePgdas(id);
    if (!def) return { erro: `Atividade ${id} não existe na tabela do PGDAS-D.` };
    const nome = nomeAtividadePgdas(id);
    if (def.motivo) return { erro: `A atividade “${nome}” ainda não pode ser declarada por aqui: ${def.motivo}.` };
    if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe um valor maior que zero em cada atividade." };

    const parcela: AtividadeDeclarada = { idAtividade: id, valor };
    // A mesma atividade só pode repetir quando cada parcela tem algo próprio
    // (outro município, ou outra combinação de substituição tributária).
    let chave = String(id);

    if (def.outroMunicipio) {
      const uf = String(a.uf ?? "").toUpperCase();
      const municipio = String(a.municipio ?? "");
      if (!(TABELA_MUNICIPIOS[uf] ?? []).some((m) => m[0] === municipio)) {
        return { erro: `Escolha a UF e o município onde o ISS é devido em “${nome}”.` };
      }
      parcela.uf = uf;
      parcela.municipio = municipio;
      chave += `|${uf}${municipio}`;
    }

    if (def.st) {
      const icms = a.icms == null ? null : Number(a.icms);
      const pisCofins = a.pisCofins == null ? null : Number(a.pisCofins);
      if (icms != null && !QUALIF_ICMS.some((q) => q.id === icms)) return { erro: "Opção de ICMS inválida." };
      if (pisCofins != null && !QUALIF_PIS_COFINS.some((q) => q.id === pisCofins)) {
        return { erro: "Opção de PIS/COFINS inválida." };
      }
      if (icms == null && pisCofins == null) {
        return {
          erro: `Em “${nome}”, marque o que tem substituição tributária ou é monofásico (ICMS e/ou PIS/COFINS). Se não houver, use a atividade “sem substituição tributária”.`,
        };
      }
      parcela.qualificacoes = [
        ...(icms != null ? [{ codigoTributo: TRIBUTO_ICMS, id: icms }] : []),
        ...(pisCofins != null
          ? [
              { codigoTributo: TRIBUTO_COFINS, id: pisCofins },
              { codigoTributo: TRIBUTO_PIS, id: pisCofins },
            ]
          : []),
      ];
      chave += `|i${icms ?? 0}p${pisCofins ?? 0}`;
    }

    if (vistos.has(chave)) {
      return { erro: `“${nome}” aparece duas vezes com os mesmos dados. Some os valores numa linha só.` };
    }
    vistos.add(chave);
    atividades.push(parcela);
  }

  // Folha de salários: só vai para a Receita quando há atividade de fator “r”
  // (mandar sem precisar é erro lá — MSG_ISN_045).
  const folhas: FolhaMes[] = [];
  if (atividades.some((a) => atividadePgdas(a.idAtividade)?.fatorR)) {
    const lista = Array.isArray(p.folhas) ? p.folhas : [];
    if (lista.length > 24) return { erro: "Lista de folhas inválida." };
    const meses = new Set<string>();
    for (const f of lista) {
      const mes = String(f.pa);
      const valor = centavos(Number(f.valor));
      if (!/^\d{4}(0[1-9]|1[0-2])$/.test(mes) || mes >= p.pa) return { erro: "Mês da folha inválido." };
      if (!Number.isFinite(valor) || valor < 0) return { erro: "Valor da folha inválido." };
      if (meses.has(mes)) return { erro: "Mês da folha repetido." };
      meses.add(mes);
      folhas.push({ pa: mes, valor });
    }
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, razao_social, nome_fantasia, cnpj")
    .eq("id", p.companyId)
    .maybeSingle();
  if (!company) return { erro: "Cliente não encontrado." };
  const cnpj = digitos(company.cnpj ?? "");
  if (cnpj.length !== 14) return { erro: "O cliente precisa ter CNPJ para declarar o Simples Nacional." };

  return {
    contratante,
    cnpj,
    nome: company.nome_fantasia || company.razao_social,
    atividades,
    folhas,
    receita: centavos(atividades.reduce((s, a) => s + a.valor, 0)),
  };
}

export interface PgdasSimulacao {
  ok: boolean;
  erro?: string;
  empresa?: string;
  /** 1 = original, 2 = retificadora (o mês já tem declaração na Receita). */
  tipo?: 1 | 2;
  receita?: number;
  valores?: ValorDevido[];
  total?: number;
  /**
   * Fator “r”: meses (AAAAMM) de folha de salários que a Receita exige para
   * calcular. Vem junto com ok=false; a tela mostra os campos e simula de novo.
   */
  mesesFolha?: string[];
}

/** A Receita calcula o imposto do mês. NADA é transmitido. */
export async function simularPgdas(p: PgdasPedido): Promise<PgdasSimulacao> {
  await requireAdmin();
  const prep = await preparar(p);
  if ("erro" in prep) return { ok: false, erro: prep.erro };

  const ids = { contratanteCnpj: prep.contratante, autorCnpj: prep.contratante, contribuinteCnpj: prep.cnpj };
  try {
    // O mês já tem declaração? Então a próxima tem de ser retificadora.
    const jaDeclarado = await periodoJaDeclarado({ ...ids, pa: p.pa });
    if (jaDeclarado === null) {
      return {
        ok: false,
        erro: "Não consegui consultar as declarações deste cliente na Receita. Verifique a procuração (PGDAS-D) e tente de novo.",
      };
    }
    const tipo: 1 | 2 = jaDeclarado ? 2 : 1;
    const r = await declararPgdas({
      ...ids,
      pa: p.pa,
      tipo,
      atividades: prep.atividades,
      folhas: prep.folhas,
      transmitir: false,
    });
    if (!r.ok) {
      if (r.mesesFolha?.length) {
        return {
          ok: false,
          mesesFolha: r.mesesFolha,
          erro: "Esta atividade tem fator “r”: informe a folha de salários dos meses abaixo e simule de novo.",
        };
      }
      return { ok: false, erro: r.erro ?? "A Receita não conseguiu calcular." };
    }
    return { ok: true, empresa: prep.nome, tipo, receita: prep.receita, valores: r.valoresDevidos, total: r.total };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao falar com a Receita." };
  }
}

export interface PgdasTransmissao {
  ok: boolean;
  erro?: string;
  idDeclaracao?: string;
  /** AAAAMMDDHHmmSS. */
  transmitidaEm?: string | null;
  total?: number;
  reciboBase64?: string | null;
  declaracaoBase64?: string | null;
  /** Multa por atraso (MAED): notificação e DARF, quando a Receita gera. */
  maedBase64?: string | null;
  darfMaedBase64?: string | null;
  /** A declaração foi guardada nos documentos do cliente? */
  documentoSalvo?: boolean;
  /**
   * DAS do mês: gerado e publicado no portal automaticamente (declaração
   * original com imposto). null = não se aplica (retificadora ou sem imposto).
   */
  das?: { publicado: boolean; titulo: string; detalhe: string } | null;
  aviso?: string;
}

/**
 * TRANSMITE a declaração (confissão de dívida). Vai com os valores da simulação:
 * se o cálculo da Receita diferir em 1 centavo, ela recusa e nada é entregue.
 * Depois de entregue, guarda a declaração nos documentos do cliente, atualiza
 * o faturamento do mês e — na declaração ORIGINAL com imposto — gera e publica
 * o DAS no portal (com aviso ao cliente). Falha nesses passos NÃO desfaz a
 * transmissão: a tela avisa e deixa o botão manual.
 *
 * Retificadora não publica DAS sozinha: o mês pode já ter guia paga, e essa
 * decisão é do contador.
 */
export async function transmitirPgdas(
  p: PgdasPedido & { tipo: 1 | 2; valores: ValorDevido[] },
): Promise<PgdasTransmissao> {
  const { profile } = await requireAdmin();
  const prep = await preparar(p);
  if ("erro" in prep) return { ok: false, erro: prep.erro };
  if (p.tipo !== 1 && p.tipo !== 2) return { ok: false, erro: "Tipo de declaração inválido." };
  const valores = (Array.isArray(p.valores) ? p.valores : [])
    .map((v) => ({ codigoTributo: Number(v.codigoTributo), valor: centavos(Number(v.valor)) }))
    .filter((v) => Number.isFinite(v.codigoTributo) && Number.isFinite(v.valor));

  let r;
  try {
    r = await declararPgdas({
      contratanteCnpj: prep.contratante,
      autorCnpj: prep.contratante,
      contribuinteCnpj: prep.cnpj,
      pa: p.pa,
      tipo: p.tipo,
      atividades: prep.atividades,
      folhas: prep.folhas,
      transmitir: true,
      valoresParaComparacao: valores,
    });
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao falar com a Receita: ${e instanceof Error ? e.message : "erro"}. Antes de tentar de novo, confira no e-CAC se a declaração chegou.`,
    };
  }
  if (!r.ok || !r.idDeclaracao) {
    return { ok: false, erro: r.erro ?? "A Receita recusou a declaração. Nada foi transmitido." };
  }

  console.info(`[pgdas] declaração ${r.idDeclaracao} transmitida (${prep.cnpj} ${p.pa}, tipo ${p.tipo}) por ${profile.id}`);

  // ----- A partir daqui a declaração JÁ FOI ENTREGUE: nada abaixo pode virar "erro". -----
  const competencia = competenciaDe(p.pa);
  const avisos: string[] = [];
  let documentoSalvo = false;
  const supabase = await createClient();

  try {
    if (r.declaracaoPdf) {
      const docId = crypto.randomUUID();
      const fileName = `PGDAS-D-${p.pa}-declaracao.pdf`;
      const path = `${p.companyId}/${docId}-${fileName}`;
      const { error: upErr } = await supabase.storage
        .from("boletos")
        .upload(path, Buffer.from(r.declaracaoPdf, "base64"), { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: insErr } = await supabase.from("documents").insert({
        id: docId,
        company_id: p.companyId,
        type: "outro",
        categoria: "documento",
        competencia,
        descricao: `${PREFIXO_DOC} — ${competencia}${p.tipo === 2 ? " · retificadora" : ""}`,
        file_path: path,
        file_name: fileName,
        uploaded_by: profile.id,
      });
      if (insErr) {
        await supabase.storage.from("boletos").remove([path]);
        throw new Error(insErr.message);
      }
      documentoSalvo = true;

      // Retificadora: a declaração anterior do mesmo mês sai dos documentos.
      const { data: antigos } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("company_id", p.companyId)
        .eq("categoria", "documento")
        .eq("type", "outro")
        .eq("competencia", competencia)
        .like("descricao", `${PREFIXO_DOC}%`)
        .neq("id", docId);
      if (antigos?.length) {
        await supabase.from("documents").delete().in("id", antigos.map((d) => d.id));
        const paths = antigos.map((d) => d.file_path).filter((x): x is string => !!x);
        if (paths.length) await supabase.storage.from("boletos").remove(paths);
      }
    } else {
      avisos.push("A Receita não devolveu o PDF da declaração; baixe-o pelo e-CAC.");
    }
  } catch (e) {
    avisos.push(`A declaração foi transmitida, mas não consegui guardar o PDF nos documentos (${e instanceof Error ? e.message : "erro"}). Baixe-o pelos botões abaixo.`);
  }

  try {
    const { error } = await supabase.from("revenues").upsert(
      { company_id: p.companyId, competencia, amount: prep.receita, uploaded_by: profile.id },
      { onConflict: "company_id,competencia" },
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    avisos.push(`Não consegui atualizar o faturamento do mês (${e instanceof Error ? e.message : "erro"}).`);
  }

  // DAS do mês: mesma regra de sempre (publicarDas) — gera na Receita, publica
  // como boleto, avisa o cliente e nunca substitui uma guia já paga.
  let das: PgdasTransmissao["das"] = null;
  if (p.tipo === 1 && r.total > 0) {
    try {
      const pub = await publicarDas(p.companyId, p.pa);
      das = { publicado: pub.ok, titulo: pub.titulo, detalhe: pub.detalhe };
    } catch (e) {
      das = {
        publicado: false,
        titulo: "Não foi possível gerar o DAS agora",
        detalhe: e instanceof Error ? e.message : "Tente pelo botão abaixo.",
      };
    }
  }

  revalidatePath("/painel", "layout");
  revalidatePath("/portal");
  revalidatePath("/portal/documentos");
  revalidatePath("/portal/faturamento");

  return {
    ok: true,
    das,
    idDeclaracao: r.idDeclaracao,
    transmitidaEm: r.dataHoraTransmissao,
    total: r.total,
    reciboBase64: r.reciboPdf,
    declaracaoBase64: r.declaracaoPdf,
    maedBase64: r.maedPdf,
    darfMaedBase64: r.darfMaedPdf,
    documentoSalvo,
    aviso: avisos.length ? avisos.join(" ") : undefined,
  };
}

/** Faturamento já lançado no sistema para o mês (para pré-preencher a tela). */
export async function faturamentoDoMes(companyId: string, pa: string): Promise<number | null> {
  await requireAdmin();
  if (!/^\d{6}$/.test(pa)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("revenues")
    .select("amount")
    .eq("company_id", companyId)
    .eq("competencia", competenciaDe(pa))
    .maybeSingle();
  return data ? Number(data.amount) : null;
}

export interface MesBaseFatorR {
  /** AAAAMM. */
  pa: string;
  /** Folha que a Receita já tem guardada (null = não tem). */
  folha: number | null;
  /** Receita bruta do mês como a Receita guarda (null = desconhecida). */
  receita: number | null;
}

export interface BaseFatorR {
  ok: boolean;
  erro?: string;
  /** Período (AAAAMM) da declaração de onde os dados foram lidos; null = nenhuma. */
  referencia?: string | null;
  /** Os 12 meses anteriores ao período, do mais antigo ao mais recente. */
  meses?: MesBaseFatorR[];
}

/** Os `n` meses (AAAAMM) anteriores a `pa`, em ordem crescente. */
function mesesAntes(pa: string, n: number): string[] {
  const ano = Number(pa.slice(0, 4));
  const mes = Number(pa.slice(4, 6));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ano, mes - 1 - (n - i), 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Base do fator “r” que a Receita já tem: folha de salários e receita dos 12
 * meses anteriores ao período, lidas do PDF da última declaração transmitida.
 * Só consulta — nada é enviado nem alterado.
 */
export async function baseFatorR(companyId: string, pa: string): Promise<BaseFatorR> {
  await requireAdmin();
  if (!serproConfigurado()) return { ok: false, erro: "A integração com a Receita não está configurada." };
  const contratante = digitos(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante || !/^\d{4}(0[1-9]|1[0-2])$/.test(pa)) return { ok: false, erro: "Parâmetros inválidos." };

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("cnpj").eq("id", companyId).maybeSingle();
  const cnpj = digitos(company?.cnpj ?? "");
  if (cnpj.length !== 14) return { ok: false, erro: "Cliente sem CNPJ." };

  const janela = mesesAntes(pa, 12);
  try {
    const d = await ultimaDeclaracaoAntesDe({
      contratanteCnpj: contratante,
      autorCnpj: contratante,
      contribuinteCnpj: cnpj,
      pa,
    });
    if (!d) return { ok: true, referencia: null, meses: janela.map((m) => ({ pa: m, folha: null, receita: null })) };
    const folha = new Map(d.folhas.map((f) => [f.pa, f.valor]));
    const receita = new Map(d.receitas.map((r) => [r.pa, r.valor]));
    if (d.pa && d.receitaPa != null) receita.set(d.pa, d.receitaPa);
    return {
      ok: true,
      referencia: d.pa,
      meses: janela.map((m) => ({ pa: m, folha: folha.get(m) ?? null, receita: receita.get(m) ?? null })),
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao consultar a Receita." };
  }
}

/** Municípios de uma UF (tabela oficial TOM/SIAFI), para o ISS devido a outro município. */
export async function municipiosDaUf(uf: string): Promise<{ codigo: string; nome: string }[]> {
  await requireAdmin();
  return (TABELA_MUNICIPIOS[String(uf).toUpperCase()] ?? []).map(([codigo, nome]) => ({ codigo, nome }));
}
