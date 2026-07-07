"use server";

import { requireAdmin } from "@/lib/auth";
import { getSerproTokens, serproConfigurado } from "@/lib/serpro/auth";
import { chamarServico } from "@/lib/serpro/client";
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
