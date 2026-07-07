"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { normalizeCompetencia } from "@/lib/dates";
import { notifyNewDocument } from "@/lib/email/notify";
import { getSerproTokens, serproConfigurado } from "@/lib/serpro/auth";
import { chamarServico } from "@/lib/serpro/client";
import { gerarDas } from "@/lib/serpro/das";
import { createClient } from "@/lib/supabase/server";

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
