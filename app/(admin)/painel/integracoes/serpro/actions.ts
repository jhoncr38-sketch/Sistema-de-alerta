"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { explicarSitfis } from "@/lib/ai/explicar-sitfis";
import { normalizeCompetencia } from "@/lib/dates";
import { notifyNewDocument } from "@/lib/email/notify";
import { getSerproTokens, serproConfigurado } from "@/lib/serpro/auth";
import { chamarServico } from "@/lib/serpro/client";
import { gerarDas } from "@/lib/serpro/das";
import { gerarDarfDctfweb } from "@/lib/serpro/dctfweb";
import { consultarSituacaoFiscal } from "@/lib/serpro/sitfis";
import { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

/** Resultado de um teste de diagnóstico da integração SERPRO. */
export interface TesteResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
  /** Corpo bruto da resposta (para você inspecionar), quando houver. */
  raw?: string;
}

/** Só dígitos — o SERPRO recebe CPF/CNPJ sem máscara. */
function digits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Etapa 1 — Testar conexão: apenas autentica no SERPRO (certificado + chaves).
 * Não consulta nem altera nada. É o teste mais seguro: prova que as credenciais
 * e o certificado e-CNPJ funcionam de ponta a ponta.
 */
export async function testarConexao(): Promise<TesteResult> {
  await requireAdmin();

  if (!serproConfigurado()) {
    return {
      ok: false,
      titulo: "Integração não configurada",
      detalhe:
        "Faltam variáveis de ambiente (SERPRO_CONSUMER_KEY, SERPRO_CONSUMER_SECRET, SERPRO_CERT_PFX_BASE64, SERPRO_CERT_PASSWORD).",
    };
  }

  try {
    const { accessToken, jwtToken } = await getSerproTokens();
    return {
      ok: true,
      titulo: "Conexão OK",
      detalhe:
        "Autenticação bem-sucedida no SERPRO. Certificado e credenciais válidos. " +
        `Tokens recebidos (access: ${accessToken.slice(0, 8)}…, jwt: ${jwtToken.slice(0, 8)}…).`,
    };
  } catch (err) {
    return {
      ok: false,
      titulo: "Falha na conexão",
      detalhe: err instanceof Error ? err.message : "Erro desconhecido.",
    };
  }
}

/**
 * Etapa 2 — Consulta de teste em UM cliente (só leitura, não emite nada).
 * Usa o serviço passado (idSistema/idServico) sobre o CNPJ do cliente escolhido.
 * O padrão sugerido é uma consulta do PGDASD (Simples Nacional). Retorna o corpo
 * bruto para você conferir o que a Receita devolve antes de a gente confiar nele.
 */
export async function consultarCliente(
  companyId: string,
  idSistema: string,
  idServico: string,
  dadosJson: string,
): Promise<TesteResult> {
  await requireAdmin();

  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante) {
    return {
      ok: false,
      titulo: "Falta o CNPJ da contratante",
      detalhe:
        "Configure SERPRO_CONTRATANTE_CNPJ com o CNPJ da SJ Contabilidade.",
    };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, razao_social, nome_fantasia")
    .eq("id", companyId)
    .single();
  if (!company) {
    return { ok: false, titulo: "Cliente não encontrado", detalhe: "" };
  }

  const contribuinte = digits(company.cnpj);
  if (!contribuinte) {
    return {
      ok: false,
      titulo: "Cliente sem CNPJ",
      detalhe: `${company.nome_fantasia || company.razao_social} não tem CNPJ cadastrado.`,
    };
  }

  let dados: Record<string, unknown> = {};
  if (dadosJson.trim()) {
    try {
      dados = JSON.parse(dadosJson);
    } catch {
      return {
        ok: false,
        titulo: "JSON de dados inválido",
        detalhe: "Revise o campo 'dados' — não é um JSON válido.",
      };
    }
  }

  try {
    const res = await chamarServico("Consultar", {
      contratanteCpfCnpj: contratante,
      autorCpfCnpj: contratante, // o contador (SJ) é o autor do pedido
      contribuinteCpfCnpj: contribuinte,
      idSistema,
      idServico,
      dados,
    });
    const raw =
      typeof res.body === "string"
        ? res.body
        : JSON.stringify(res.body, null, 2);
    return {
      ok: res.status >= 200 && res.status < 300,
      titulo: `Resposta HTTP ${res.status}`,
      detalhe:
        res.status >= 200 && res.status < 300
          ? "Consulta concluída. Confira o retorno abaixo."
          : "O SERPRO recusou ou retornou erro. Veja o detalhe abaixo.",
      raw: raw.slice(0, 4000),
    };
  } catch (err) {
    return {
      ok: false,
      titulo: "Erro na consulta",
      detalhe: err instanceof Error ? err.message : "Erro desconhecido.",
    };
  }
}

/** Resultado da emissão de DAS de teste (com o PDF para conferência). */
export interface DasTesteResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
  /** PDF do DAS em base64 (para o navegador exibir/baixar). */
  pdfBase64?: string;
  valor?: number | null;
  vencimento?: string | null;
  numeroDocumento?: string | null;
  raw?: string;
}

/**
 * Emite o DAS de um cliente para um período (YYYYMM) — MAS NÃO PUBLICA NADA.
 * Gera a guia na Receita e devolve o PDF para o contador conferir na tela antes
 * de decidir o que fazer com ela. É o passo de validação da Fatia 2.
 */
export async function emitirDasTeste(
  companyId: string,
  periodoApuracao: string,
): Promise<DasTesteResult> {
  await requireAdmin();

  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante) {
    return {
      ok: false,
      titulo: "Falta o CNPJ da contratante",
      detalhe: "Configure SERPRO_CONTRATANTE_CNPJ com o CNPJ da SJ Contabilidade.",
    };
  }

  const periodo = digits(periodoApuracao);
  if (!/^\d{6}$/.test(periodo)) {
    return {
      ok: false,
      titulo: "Período inválido",
      detalhe: "Informe o período de apuração no formato AAAAMM (ex.: 202506).",
    };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, razao_social, nome_fantasia")
    .eq("id", companyId)
    .single();
  if (!company) {
    return { ok: false, titulo: "Cliente não encontrado", detalhe: "" };
  }
  const contribuinte = digits(company.cnpj);
  if (!contribuinte) {
    return {
      ok: false,
      titulo: "Cliente sem CNPJ",
      detalhe: `${company.nome_fantasia || company.razao_social} não tem CNPJ cadastrado.`,
    };
  }

  try {
    const r = await gerarDas({
      contratanteCnpj: contratante,
      autorCnpj: contratante,
      contribuinteCnpj: contribuinte,
      periodoApuracao: periodo,
    });
    if (!r.ok || !r.das) {
      return {
        ok: false,
        titulo: `Não foi possível gerar o DAS (HTTP ${r.status})`,
        detalhe: r.erro ?? "A Receita não retornou o DAS.",
        raw: r.raw,
      };
    }
    return {
      ok: true,
      titulo: "DAS gerado com sucesso",
      detalhe:
        "Confira o PDF abaixo antes de qualquer coisa. Nada foi publicado nem enviado ao cliente.",
      pdfBase64: r.das.pdfBase64,
      valor: r.das.valor,
      vencimento: r.das.vencimento,
      numeroDocumento: r.das.numeroDocumento,
      raw: r.raw,
    };
  } catch (err) {
    return {
      ok: false,
      titulo: "Erro ao gerar DAS",
      detalhe: err instanceof Error ? err.message : "Erro desconhecido.",
    };
  }
}

/** Resultado da publicação do DAS como boleto no portal do cliente. */
export interface PublicarDasResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
}

/**
 * "AAAAMM" -> "MM/AAAA" — MESMO formato que o resto do sistema usa (via
 * normalizeCompetencia). Essencial para a regra de "DAS já existe" reconhecer
 * também os DAS lançados manualmente e não duplicar.
 */
function competenciaDeApuracao(periodo: string): string {
  return normalizeCompetencia(`${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`);
}

/**
 * Fatia 3 — PUBLICA o DAS como um boleto normal no portal do cliente.
 *
 * Regera o DAS no servidor (não confia em PDF vindo do navegador), sobe o PDF no
 * bucket 'boletos' e cria a linha em documents (categoria 'boleto', type 'das')
 * com o valor e o vencimento que a Receita informou. A partir daí é um boleto
 * como qualquer outro: entra no portal, nos alertas de vencimento e no dashboard.
 * Idempotência simples: evita duplicar o DAS do mesmo cliente/período.
 */
export async function publicarDas(
  companyId: string,
  periodoApuracao: string,
): Promise<PublicarDasResult> {
  const { profile } = await requireAdmin();

  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  const periodo = digits(periodoApuracao);
  if (!contratante || !/^\d{6}$/.test(periodo)) {
    return {
      ok: false,
      titulo: "Parâmetros inválidos",
      detalhe: "Verifique o CNPJ da contratante e o período (AAAAMM).",
    };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, razao_social, nome_fantasia")
    .eq("id", companyId)
    .single();
  if (!company) {
    return { ok: false, titulo: "Cliente não encontrado", detalhe: "" };
  }
  const contribuinte = digits(company.cnpj);
  const nome = company.nome_fantasia || company.razao_social;
  if (!contribuinte) {
    return {
      ok: false,
      titulo: "Cliente sem CNPJ",
      detalhe: `${nome} não tem CNPJ cadastrado.`,
    };
  }

  const competencia = competenciaDeApuracao(periodo);
  const mesRef = `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;

  // Já existe DAS deste cliente/competência (inclui os lançados manualmente)? A
  // regra, agora tolerante a 1+ existentes:
  //   • se QUALQUER um já está pago/aguardando -> bloqueia (preserva histórico);
  //   • senão -> substitui todos os em aberto pelo novo (evita duplicatas).
  const { data: existentes } = await supabase
    .from("documents")
    .select("id, status, file_path")
    .eq("company_id", companyId)
    .eq("categoria", "boleto")
    .eq("type", "das")
    .eq("competencia", competencia);
  const antigos = existentes ?? [];
  if (antigos.some((d) => d.status !== "open")) {
    return {
      ok: false,
      titulo: "DAS já pago",
      detalhe: `O DAS de ${nome} para ${mesRef} já foi marcado como pago/aguardando. Não substituí para não perder esse histórico. Se precisar reemitir, remova o antigo primeiro.`,
    };
  }

  // Regera o DAS no servidor (fonte da verdade — não usa PDF do navegador).
  const r = await gerarDas({
    contratanteCnpj: contratante,
    autorCnpj: contratante,
    contribuinteCnpj: contribuinte,
    periodoApuracao: periodo,
  });
  if (!r.ok || !r.das) {
    return {
      ok: false,
      titulo: "Não foi possível gerar o DAS",
      detalhe: r.erro ?? "A Receita não retornou o DAS.",
    };
  }
  const { pdfBase64, valor, vencimento } = r.das;
  if (valor == null || !vencimento) {
    return {
      ok: false,
      titulo: "DAS sem valor ou vencimento",
      detalhe:
        "A Receita não informou valor/vencimento — não publiquei para evitar um boleto incorreto.",
    };
  }

  // Sobe o PDF (base64 -> arquivo) no mesmo bucket dos boletos.
  const docId = crypto.randomUUID();
  const fileName = `DAS-${periodo}-${contribuinte}.pdf`;
  const path = `${companyId}/${docId}-${fileName}`;
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const { error: upErr } = await supabase.storage
    .from("boletos")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    return {
      ok: false,
      titulo: "Falha ao salvar o PDF",
      detalhe: upErr.message,
    };
  }

  // Cria o boleto (mesma forma do envio manual em /painel/enviar).
  const { error: insErr } = await supabase.from("documents").insert({
    id: docId,
    company_id: companyId,
    type: "das",
    categoria: "boleto",
    competencia,
    amount: valor,
    due_date: vencimento,
    file_path: path,
    file_name: fileName,
    uploaded_by: profile.id,
  });
  if (insErr) {
    await supabase.storage.from("boletos").remove([path]); // desfaz o órfão
    return {
      ok: false,
      titulo: "Falha ao registrar o boleto",
      detalhe: insErr.message,
    };
  }

  // Substituição: o novo DAS entrou; remove os antigos (todos em aberto) e os
  // PDFs deles. Só chega aqui se nenhum estava pago (o pago já foi bloqueado).
  const substituido = antigos.length > 0;
  if (substituido) {
    const ids = antigos.map((d) => d.id);
    await supabase.from("documents").delete().in("id", ids);
    const paths = antigos
      .map((d) => d.file_path)
      .filter((p): p is string => !!p);
    if (paths.length) {
      await supabase.storage.from("boletos").remove(paths);
    }
  }

  // Avisa o cliente (mesmo aviso dos boletos manuais).
  after(() =>
    notifyNewDocument({
      companyId,
      documentId: docId,
      categoria: "boleto",
      type: "das",
      competencia,
      amount: valor,
      dueDate: vencimento,
      count: 1,
    }).catch((err) => console.error("[notify] DAS publicado:", err)),
  );

  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");

  const venBR = vencimento.split("-").reverse().join("/");
  return {
    ok: true,
    titulo: substituido ? "DAS atualizado no portal" : "DAS publicado no portal",
    detalhe: substituido
      ? `O DAS de ${nome} para ${mesRef} (que estava em aberto) foi substituído pelo novo (venc. ${venBR}). O cliente será avisado.`
      : `DAS de ${nome} (venc. ${venBR}) publicado como boleto. O cliente já pode ver e será avisado.`,
  };
}

// ============================================================
// Situação Fiscal (SITFIS) — consultar e publicar como documento
// ============================================================

export interface SitfisConsultaResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
  /** PDF do relatório em base64 (para exibir/baixar). */
  pdfBase64?: string;
}

/** Busca o CNPJ do cliente e roda o SITFIS. Reaproveitado por consulta/publicação. */
async function rodarSitfis(companyId: string): Promise<
  | { erro: SitfisConsultaResult }
  | { nome: string; pdfBase64: string }
> {
  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante) {
    return {
      erro: {
        ok: false,
        titulo: "Falta o CNPJ da contratante",
        detalhe: "Configure SERPRO_CONTRATANTE_CNPJ.",
      },
    };
  }
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, razao_social, nome_fantasia")
    .eq("id", companyId)
    .single();
  if (!company) {
    return { erro: { ok: false, titulo: "Cliente não encontrado", detalhe: "" } };
  }
  const contribuinte = digits(company.cnpj);
  const nome = company.nome_fantasia || company.razao_social;
  if (!contribuinte) {
    return {
      erro: {
        ok: false,
        titulo: "Cliente sem CNPJ",
        detalhe: `${nome} não tem CNPJ cadastrado.`,
      },
    };
  }

  const r = await consultarSituacaoFiscal({
    contratanteCnpj: contratante,
    autorCnpj: contratante,
    contribuinteCnpj: contribuinte,
  });
  if (!r.ok || !r.pdfBase64) {
    return {
      erro: {
        ok: false,
        titulo: "Não foi possível obter a situação fiscal",
        detalhe: r.erro ?? "A Receita não retornou o relatório.",
      },
    };
  }
  return { nome, pdfBase64: r.pdfBase64 };
}

/**
 * Consulta a situação fiscal de um cliente na Receita (SITFIS) — só leitura.
 * Devolve o PDF do relatório para o contador conferir. Não publica nada.
 */
export async function consultarSitfis(
  companyId: string,
): Promise<SitfisConsultaResult> {
  await requireAdmin();
  const r = await rodarSitfis(companyId);
  if ("erro" in r) return r.erro;
  return {
    ok: true,
    titulo: "Situação fiscal obtida",
    detalhe: `Relatório de ${r.nome} gerado. Confira abaixo. Nada foi publicado.`,
    pdfBase64: r.pdfBase64,
  };
}

/**
 * Publica o relatório de situação fiscal no portal do cliente, como DOCUMENTO
 * informativo (categoria 'documento', type 'relatorio_fiscal'). Regera na
 * Receita (fonte da verdade) e sobe o PDF. Avisa o cliente.
 */
export async function publicarSitfis(
  companyId: string,
  resumoIa?: string,
): Promise<SitfisConsultaResult> {
  const { profile } = await requireAdmin();
  const r = await rodarSitfis(companyId);
  if ("erro" in r) return r.erro;

  const supabase = await createClient();
  const docId = crypto.randomUUID();
  const hoje = new Date().toISOString().slice(0, 10);
  const fileName = `Situacao-Fiscal-${hoje}.pdf`;
  const path = `${companyId}/${docId}-${fileName}`;
  const pdfBytes = Buffer.from(r.pdfBase64, "base64");

  const { error: upErr } = await supabase.storage
    .from("boletos")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    return { ok: false, titulo: "Falha ao salvar o PDF", detalhe: upErr.message };
  }

  // Se o contador gerou o resumo por IA, ele vira a descrição que o cliente lê
  // no portal (em vez do rótulo técnico). Limitamos o tamanho por segurança.
  const descricao =
    resumoIa && resumoIa.trim()
      ? resumoIa.trim().slice(0, 1000)
      : "Relatório de situação fiscal (Receita Federal)";

  const { error: insErr } = await supabase.from("documents").insert({
    id: docId,
    company_id: companyId,
    type: "relatorio_fiscal",
    categoria: "documento",
    descricao,
    file_path: path,
    file_name: fileName,
    uploaded_by: profile.id,
  });
  if (insErr) {
    await supabase.storage.from("boletos").remove([path]);
    return {
      ok: false,
      titulo: "Falha ao registrar o documento",
      detalhe: insErr.message,
    };
  }

  // A situação fiscal é uma "foto do momento": só o relatório mais recente
  // interessa. O novo já entrou — remove os relatórios fiscais anteriores deste
  // cliente (registro + PDF), mantendo apenas este.
  const { data: antigos } = await supabase
    .from("documents")
    .select("id, file_path")
    .eq("company_id", companyId)
    .eq("categoria", "documento")
    .eq("type", "relatorio_fiscal")
    .neq("id", docId);
  const substituiu = !!(antigos && antigos.length);
  if (substituiu) {
    await supabase
      .from("documents")
      .delete()
      .in(
        "id",
        antigos!.map((d) => d.id),
      );
    const paths = antigos!
      .map((d) => d.file_path)
      .filter((p): p is string => !!p);
    if (paths.length) {
      await supabase.storage.from("boletos").remove(paths);
    }
  }

  after(() =>
    notifyNewDocument({
      companyId,
      documentId: docId,
      categoria: "documento",
      type: "relatorio_fiscal",
      competencia: null,
      amount: null,
      dueDate: null,
      count: 1,
    }).catch((err) => console.error("[notify] situação fiscal:", err)),
  );

  revalidatePath("/painel/documentos");
  revalidatePath("/portal");

  return {
    ok: true,
    titulo: substituiu ? "Situação fiscal atualizada" : "Situação fiscal publicada",
    detalhe: substituiu
      ? `O relatório de ${r.nome} foi atualizado no portal (o anterior foi substituído). O cliente será avisado.`
      : `O relatório de ${r.nome} foi publicado no portal como documento. O cliente será avisado.`,
    pdfBase64: r.pdfBase64,
  };
}

export interface ExplicarSitfisResult {
  ok: boolean;
  /** Resumo em linguagem simples (quando ok). */
  resumo?: string;
  erro?: string;
}

/**
 * Gera um resumo em português simples da situação fiscal de um cliente, via IA.
 * Regera o SITFIS no servidor (fonte da verdade) e manda o PDF para a IA ler.
 * Custa tokens — por isso é acionado por um botão separado, não automático.
 */
export async function explicarSituacaoFiscal(
  companyId: string,
): Promise<ExplicarSitfisResult> {
  await requireAdmin();
  const r = await rodarSitfis(companyId);
  if ("erro" in r) return { ok: false, erro: r.erro.detalhe || r.erro.titulo };

  const resumo = await explicarSitfis(r.pdfBase64);
  if (!resumo) {
    return {
      ok: false,
      erro: "A IA não está disponível agora (verifique a chave OpenAI) ou falhou. Tente de novo.",
    };
  }
  return { ok: true, resumo };
}

// ============================================================
// DCTFWeb — gerar DARF (INSS/PIS/COFINS/IRPJ/CSLL) e publicar como boleto
// ============================================================

export interface DarfGerarResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
  /** PDF do DARF em base64 (para conferência). */
  pdfBase64?: string;
}

/** Tipos de DARF que o contador pode rotular ao publicar. */
const DARF_TYPES: DocType[] = [
  "darf_piscofins",
  "darf_irpj",
  "darf_csll",
  "gps_inss",
  "outro",
];

/** Busca o CNPJ do cliente e gera o DARF da DCTFWeb. Reusado por gerar/publicar. */
async function rodarDarf(
  companyId: string,
  categoria: string,
  anoPA: string,
  mesPA: string,
): Promise<{ erro: DarfGerarResult } | { nome: string; pdfBase64: string }> {
  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ ?? "");
  if (!contratante) {
    return {
      erro: {
        ok: false,
        titulo: "Falta o CNPJ da contratante",
        detalhe: "Configure SERPRO_CONTRATANTE_CNPJ.",
      },
    };
  }
  if (!/^\d{4}$/.test(anoPA) || !/^\d{2}$/.test(mesPA)) {
    return {
      erro: {
        ok: false,
        titulo: "Período inválido",
        detalhe: "Informe ano (AAAA) e mês (MM) válidos.",
      },
    };
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, razao_social, nome_fantasia")
    .eq("id", companyId)
    .single();
  if (!company) {
    return { erro: { ok: false, titulo: "Cliente não encontrado", detalhe: "" } };
  }
  const contribuinte = digits(company.cnpj);
  const nome = company.nome_fantasia || company.razao_social;
  if (!contribuinte) {
    return {
      erro: {
        ok: false,
        titulo: "Cliente sem CNPJ",
        detalhe: `${nome} não tem CNPJ cadastrado.`,
      },
    };
  }

  const r = await gerarDarfDctfweb({
    contratanteCnpj: contratante,
    autorCnpj: contratante,
    contribuinteCnpj: contribuinte,
    categoria,
    anoPA,
    mesPA,
  });
  if (!r.ok || !r.pdfBase64) {
    return {
      erro: {
        ok: false,
        titulo: `Não foi possível gerar o DARF (DCTFWeb)`,
        detalhe: r.erro ?? "A Receita não retornou o DARF.",
      },
    };
  }
  return { nome, pdfBase64: r.pdfBase64 };
}

/**
 * Gera o DARF da DCTFWeb para conferência (só leitura). Devolve o PDF — o
 * contador confere o valor e o vencimento nele antes de publicar.
 */
export async function gerarDarf(
  companyId: string,
  categoria: string,
  anoPA: string,
  mesPA: string,
): Promise<DarfGerarResult> {
  await requireAdmin();
  const r = await rodarDarf(companyId, categoria, anoPA, mesPA);
  if ("erro" in r) return r.erro;
  return {
    ok: true,
    titulo: "DARF gerado com sucesso",
    detalhe:
      "Confira o PDF: informe abaixo o valor e o vencimento que aparecem no DARF para publicar como boleto. Nada foi publicado ainda.",
    pdfBase64: r.pdfBase64,
  };
}

export interface PublicarDarfResult {
  ok: boolean;
  titulo: string;
  detalhe: string;
}

/**
 * Publica o DARF da DCTFWeb como BOLETO no portal. Como a Receita não devolve
 * valor/vencimento nesse serviço, eles vêm do contador (que os leu no PDF).
 * Regera o DARF no servidor (fonte da verdade) e cria o boleto.
 */
export async function publicarDarf(params: {
  companyId: string;
  categoria: string;
  anoPA: string;
  mesPA: string;
  type: string; // rótulo do DARF (darf_piscofins, gps_inss, ...)
  valor: number;
  vencimento: string; // YYYY-MM-DD
}): Promise<PublicarDarfResult> {
  const { profile } = await requireAdmin();

  if (!(params.valor > 0)) {
    return { ok: false, titulo: "Valor inválido", detalhe: "Informe o valor do DARF." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.vencimento)) {
    return {
      ok: false,
      titulo: "Vencimento inválido",
      detalhe: "Informe o vencimento (data) do DARF.",
    };
  }
  const type: DocType = DARF_TYPES.includes(params.type as DocType)
    ? (params.type as DocType)
    : "outro";

  const r = await rodarDarf(
    params.companyId,
    params.categoria,
    params.anoPA,
    params.mesPA,
  );
  if ("erro" in r) {
    return { ok: false, titulo: r.erro.titulo, detalhe: r.erro.detalhe };
  }

  const competencia = normalizeCompetencia(`${params.mesPA}/${params.anoPA}`);
  const supabase = await createClient();
  const docId = crypto.randomUUID();
  const fileName = `DARF-${params.anoPA}${params.mesPA}-${params.categoria}.pdf`;
  const path = `${params.companyId}/${docId}-${fileName}`;
  const pdfBytes = Buffer.from(r.pdfBase64, "base64");

  const { error: upErr } = await supabase.storage
    .from("boletos")
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    return { ok: false, titulo: "Falha ao salvar o PDF", detalhe: upErr.message };
  }

  const { error: insErr } = await supabase.from("documents").insert({
    id: docId,
    company_id: params.companyId,
    type,
    categoria: "boleto",
    competencia,
    amount: params.valor,
    due_date: params.vencimento,
    descricao: "DARF DCTFWeb (tributos federais)",
    file_path: path,
    file_name: fileName,
    uploaded_by: profile.id,
  });
  if (insErr) {
    await supabase.storage.from("boletos").remove([path]);
    return {
      ok: false,
      titulo: "Falha ao registrar o boleto",
      detalhe: insErr.message,
    };
  }

  after(() =>
    notifyNewDocument({
      companyId: params.companyId,
      documentId: docId,
      categoria: "boleto",
      type,
      competencia,
      amount: params.valor,
      dueDate: params.vencimento,
      count: 1,
    }).catch((err) => console.error("[notify] DARF publicado:", err)),
  );

  revalidatePath("/painel");
  revalidatePath("/painel/documentos");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");

  const venBR = params.vencimento.split("-").reverse().join("/");
  return {
    ok: true,
    titulo: "DARF publicado no portal",
    detalhe: `DARF de ${r.nome} (venc. ${venBR}) publicado como boleto. O cliente já pode ver e será avisado.`,
  };
}
