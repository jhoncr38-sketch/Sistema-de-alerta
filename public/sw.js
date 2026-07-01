// Service worker do ContAlert.
// IMPORTANTE: ele NÃO guarda nada offline (sem cache). Existe para que o
// navegador reconheça o portal como "app instalável" e para receber Web Push.
// Todas as requisições continuam indo à rede ao vivo — sem risco de dado
// desatualizado.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Sem cache: deixamos o navegador buscar tudo da rede, como num site normal.
});

// ----- Web Push -----
// Recebe o aviso enviado pelo servidor e mostra a notificação nativa.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ContAlert", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ContAlert";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    // "tag" agrupa: um novo aviso do mesmo boleto substitui o anterior.
    tag: data.tag || undefined,
    data: { url: data.url || "/portal/boletos" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação, foca uma aba já aberta do portal ou abre uma nova.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
