import https from "node:https";

/**
 * Autenticação no Integra Contador (SERPRO).
 *
 * O SERPRO exige mTLS: o certificado e-CNPJ (ICP-Brasil) é apresentado na
 * conexão TLS, além do par Consumer Key/Secret em Basic Auth. Em troca vêm dois
 * tokens que acompanham TODA chamada de serviço: `access_token` (Bearer) e
 * `jwt_token`. O access_token expira (~33min); guardamos em memória e só
 * reautenticamos quando falta pouco para expirar.
 *
 * IMPORTANTE: só roda em runtime Node.js (usa node:https com Agent + pfx).
 * Nunca importar em Client Component nem em rota Edge.
 *
 * Config por variáveis de ambiente (nada de segredo no código):
 *   SERPRO_CONSUMER_KEY, SERPRO_CONSUMER_SECRET  — credenciais da loja SERPRO
 *   SERPRO_CERT_PEM_BASE64                        — certificado (PEM) em base64
 *   SERPRO_KEY_PEM_BASE64                         — chave privada (PEM) em base64
 *
 * Usamos PEM (cert + key) em vez do .pfx porque o Node 24 (OpenSSL 3) rejeita o
 * PKCS12 do ICP-Brasil ("Unsupported PKCS12 PFX data"). O .pfx é convertido uma
 * vez com `openssl pkcs12 -legacy` (ver instruções no .env.local).
 */

const AUTH_URL = "https://autenticacao.sapi.serpro.gov.br/authenticate";

export interface SerproTokens {
  accessToken: string;
  jwtToken: string;
}

interface CachedToken extends SerproTokens {
  /** Epoch ms em que o access_token deixa de valer (com margem de segurança). */
  expiresAt: number;
}

// Cache em memória do processo. Em serverless cada instância tem o seu; como o
// token dura ~33min e a autenticação é barata, é suficiente e evita um store.
let cache: CachedToken | null = null;

/** Lê e valida as credenciais do ambiente. Retorna null se não configurado. */
function readConfig() {
  const consumerKey = process.env.SERPRO_CONSUMER_KEY;
  const consumerSecret = process.env.SERPRO_CONSUMER_SECRET;
  const certBase64 = process.env.SERPRO_CERT_PEM_BASE64;
  const keyBase64 = process.env.SERPRO_KEY_PEM_BASE64;
  if (!consumerKey || !consumerSecret || !certBase64 || !keyBase64) {
    return null;
  }
  return { consumerKey, consumerSecret, certBase64, keyBase64 };
}

/** true se as credenciais do SERPRO estão configuradas (para telas/guards). */
export function serproConfigurado(): boolean {
  return readConfig() !== null;
}

/**
 * POST no endpoint de autenticação apresentando o certificado via mTLS. Usamos
 * node:https direto porque o fetch padrão não permite anexar certificado de
 * cliente (pfx). Resolve com o corpo JSON da resposta ou rejeita com o erro.
 */
function requestToken(cfg: NonNullable<ReturnType<typeof readConfig>>) {
  const basic = Buffer.from(
    `${cfg.consumerKey}:${cfg.consumerSecret}`,
  ).toString("base64");
  const body = "grant_type=client_credentials";
  const cert = Buffer.from(cfg.certBase64, "base64");
  const key = Buffer.from(cfg.keyBase64, "base64");

  return new Promise<{ access_token: string; jwt_token: string; expires_in: number }>(
    (resolve, reject) => {
      const url = new URL(AUTH_URL);
      const req = https.request(
        {
          method: "POST",
          hostname: url.hostname,
          path: url.pathname,
          port: 443,
          cert,
          key,
          headers: {
            Authorization: `Basic ${basic}`,
            "Role-Type": "TERCEIROS",
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch {
                reject(new Error("Resposta de autenticação inválida do SERPRO."));
              }
            } else {
              reject(
                new Error(
                  `Falha na autenticação SERPRO (HTTP ${res.statusCode}): ${data.slice(0, 200)}`,
                ),
              );
            }
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    },
  );
}

/**
 * Retorna tokens válidos do SERPRO (do cache, ou reautenticando). Lança se as
 * credenciais não estiverem configuradas — quem chama deve checar antes com
 * `serproConfigurado()` para dar uma mensagem amigável ao usuário.
 */
export async function getSerproTokens(): Promise<SerproTokens> {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error(
      "Integração SERPRO não configurada. Faltam as variáveis de ambiente.",
    );
  }

  // Reusa enquanto faltar mais de 60s para expirar.
  if (cache && cache.expiresAt - Date.now() > 60_000) {
    return { accessToken: cache.accessToken, jwtToken: cache.jwtToken };
  }

  const res = await requestToken(cfg);
  cache = {
    accessToken: res.access_token,
    jwtToken: res.jwt_token,
    // Margem: expira 60s antes do informado, para nunca usar token vencido.
    expiresAt: Date.now() + (res.expires_in - 60) * 1000,
  };
  return { accessToken: cache.accessToken, jwtToken: cache.jwtToken };
}

/** Descarta o token em cache (após um 401, para forçar reautenticação). */
export function invalidarTokenSerpro() {
  cache = null;
}
