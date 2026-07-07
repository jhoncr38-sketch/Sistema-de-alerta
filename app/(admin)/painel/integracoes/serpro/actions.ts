"use server";

import { requireAdmin } from "@/lib/auth";
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
