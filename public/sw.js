// Service worker mínimo do ContAlert.
// IMPORTANTE: ele NÃO guarda nada offline (sem cache). Existe apenas para que o
// navegador reconheça o portal como "app instalável" e mostre o convite de
// instalação automaticamente. Todas as requisições continuam indo à rede ao
// vivo — sem risco de dado desatualizado.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Sem cache: deixamos o navegador buscar tudo da rede, como num site normal.
});
