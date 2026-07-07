import https from "node:https";
import {
  getSerproTokens,
  invalidarTokenSerpro,
  serproConfigurado,
} from "@/lib/serpro/auth";

/**
 * Client genérico do Integra Contador (SERPRO).
 *
 * Toda requisição de serviço usa o mesmo envelope (contratante / autorPedidoDados
 * / contribuinte / pedidoDados) e vai para um dos endpoints de ação: Consultar,
 * Emitir, Declarar, Monitorar, Apoiar. Aqui centralizamos: token, headers,
 * certificado (mTLS) e o retry único em caso de 401 (token expirado).
 *
 * Só roda em runtime Node.js. Nunca importar em Client Component nem rota Edge.
 */

const BASE = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";

export { serproConfigurado };

/** Ações do gateway — cada serviço é chamado por uma delas. */
export type SerproAcao =
  | "Consultar"
  | "Emitir"
  | "Declarar"
  | "Monitorar"
  | "Apoiar";

/** Identifica quem contrata, quem pede e sobre quem é o pedido. */
export interface SerproEnvelope {
  /** CNPJ da SJ Contabilidade (contratante da API). Só dígitos. */
  contratanteCpfCnpj: string;
  /** CPF/CNPJ do autor do pedido (o contador). Só dígitos. */
  autorCpfCnpj: string;
  /** CPF/CNPJ do contribuinte (o cliente). Só dígitos. */
  contribuinteCpfCnpj: string;
  /** Sistema/serviço do Integra Contador (ex.: PGDASD / gerar_das). */
  idSistema: string;
  idServico: string;
  versaoSistema?: string;
  /** Payload específico do serviço (varia por idServico). */
  dados: Record<string, unknown>;
  /**
   * Token do autenticarProcurador, quando o serviço exige (XML assinado).
   * A maioria dos serviços com procuração no e-CAC NÃO precisa disto.
   */
  procuradorToken?: string;
}

export interface SerproResposta {
  status: number;
  /** Corpo já parseado (o SERPRO devolve JSON; `dados` costuma vir como string). */
  body: unknown;
}

/**
 * Identificador no formato do Integra Contador: { numero, tipo }.
 * tipo 1 = CPF (11 dígitos), tipo 2 = CNPJ (14 dígitos). Detecta pelo tamanho.
 */
function identificador(cpfCnpj: string) {
  const numero = cpfCnpj.replace(/\D/g, "");
  return { numero, tipo: numero.length === 11 ? 1 : 2 };
}

function corpo(env: SerproEnvelope) {
  return JSON.stringify({
    contratante: identificador(env.contratanteCpfCnpj),
    autorPedidoDados: identificador(env.autorCpfCnpj),
    contribuinte: identificador(env.contribuinteCpfCnpj),
    pedidoDados: {
      idSistema: env.idSistema,
      idServico: env.idServico,
      versaoSistema: env.versaoSistema ?? "1.0",
      dados:
        typeof env.dados === "string" ? env.dados : JSON.stringify(env.dados),
    },
  });
}

/** POST cru no gateway apresentando o certificado (mTLS) e os dois tokens. */
function post(
  acao: SerproAcao,
  payload: string,
  tokens: { accessToken: string; jwtToken: string },
  procuradorToken?: string,
) {
  const cert = Buffer.from(process.env.SERPRO_CERT_PEM_BASE64!, "base64");
  const key = Buffer.from(process.env.SERPRO_KEY_PEM_BASE64!, "base64");

  return new Promise<SerproResposta>((resolve, reject) => {
    const url = new URL(`${BASE}/${acao}`);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokens.accessToken}`,
      jwt_token: tokens.jwtToken,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
    };
    if (procuradorToken) headers.autenticar_procurador_token = procuradorToken;

    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname,
        port: 443,
        cert,
        key,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let body: unknown = data;
          try {
            body = JSON.parse(data);
          } catch {
            /* mantém string crua se não for JSON */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Chama um serviço do Integra Contador. Autentica (com cache), monta o envelope
 * e envia. Em 401 (token expirado), invalida o cache e tenta UMA vez de novo.
 */
export async function chamarServico(
  acao: SerproAcao,
  env: SerproEnvelope,
): Promise<SerproResposta> {
  if (!serproConfigurado()) {
    throw new Error("Integração SERPRO não configurada.");
  }
  const payload = corpo(env);

  let tokens = await getSerproTokens();
  let res = await post(acao, payload, tokens, env.procuradorToken);

  if (res.status === 401) {
    invalidarTokenSerpro();
    tokens = await getSerproTokens();
    res = await post(acao, payload, tokens, env.procuradorToken);
  }
  return res;
}
