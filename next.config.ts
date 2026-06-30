import type { NextConfig } from "next";

/**
 * Headers de segurança aplicados a todas as respostas. São proteções que o
 * navegador passa a impor. Deixamos o Content-Security-Policy de fora por ora —
 * ele exige listar todas as origens (Supabase, fontes, etc.) e quebra a tela se
 * faltar alguma; vale fazer num passo dedicado.
 */
const securityHeaders = [
  // Anti-clickjacking: impede que o portal seja embutido em <iframe> de outro site.
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o navegador de "adivinhar" o tipo de um arquivo (evita PDF/imagem
  // ser interpretado como script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza o caminho interno completo ao seguir links para fora do site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Obriga HTTPS por 2 anos (inclui subdomínios). Só tem efeito sob HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
