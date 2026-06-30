import type { MetadataRoute } from "next";

/**
 * Manifesto do app (PWA): permite "instalar" o portal na tela inicial do
 * celular, abrindo em tela cheia com ícone próprio. Não há cache offline —
 * o portal continua buscando os dados ao vivo, como um site normal.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "S J Contabilidade",
    short_name: "S J Contábil",
    description: "Portal de boletos e obrigações contábeis.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
