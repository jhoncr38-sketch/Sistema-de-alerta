"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (/sw.js) para habilitar o convite de instalação do
 * app. Não há cache — se o registro falhar, o portal funciona normalmente.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silencioso: instalação é opcional, o portal segue funcionando */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
