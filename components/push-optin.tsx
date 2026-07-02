"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Botão de opt-in do Web Push, na aba Notificações do cliente. Opcional: se o
 * navegador não suportar, ou o cliente negar, os avisos continuam por e-mail.
 * No iPhone, o push exige o PWA instalado na tela inicial.
 */

type Estado =
  | "carregando"
  | "indisponivel"
  | "ios_instalar"
  | "negado"
  | "ativar"
  | "ativado";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Converte a chave pública VAPID (base64url) no formato que o navegador exige. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Registra o service worker (idempotente) e espera ele ficar ativo. */
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function PushOptIn() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    let alive = true;
    const init = async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        !!VAPID_PUBLIC;

      const ua = navigator.userAgent;
      const ios =
        /iphone|ipad|ipod/i.test(ua) ||
        // iPad recente se identifica como Mac com tela sensível ao toque.
        (/macintosh/i.test(ua) && "ontouchend" in document);
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (alive) setIsIos(ios);

      if (!supported) {
        if (alive) setEstado(ios && !isStandalone ? "ios_instalar" : "indisponivel");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setEstado("negado");
        return;
      }

      if (alive) setEstado("ativar");
      try {
        const reg = await ensureRegistration();
        const sub = await reg.pushManager.getSubscription();
        if (sub && alive) setEstado("ativado");
      } catch {
        /* mantém "ativar" */
      }
    };
    init();
    return () => {
      alive = false;
    };
  }, []);

  async function ativar() {
    setBusy(true);
    setErro(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "negado" : "ativar");
        return;
      }
      const reg = await ensureRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error();
      setEstado("ativado");
    } catch {
      setErro("Não consegui ativar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function desativar() {
    setBusy(true);
    setErro(null);
    try {
      const reg = await ensureRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("ativar");
    } catch {
      setErro("Não consegui desativar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (estado === "carregando" || estado === "indisponivel") return null;

  const box =
    "rounded-xl border bg-muted/30 p-4 flex flex-wrap items-center gap-3";

  if (estado === "ios_instalar") {
    return (
      <div className={box}>
        <span className="text-lg">🔔</span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Para receber avisos no iPhone: Compartilhar → Adicionar à Tela de
          Início.
        </p>
      </div>
    );
  }

  if (estado === "negado") {
    return (
      <div className={box}>
        <span className="text-lg">🔕</span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Avisos bloqueados —{" "}
          {isIos
            ? "libere em Ajustes → Notificações."
            : "libere no cadeado 🔒 da barra de endereço."}
        </p>
      </div>
    );
  }

  if (estado === "ativado") {
    return (
      <div className={box}>
        <span className="text-lg">🔔</span>
        <p className="min-w-0 flex-1 text-sm font-medium">Avisos ativados</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={desativar}
        >
          {busy ? "..." : "Desativar"}
        </Button>
        {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
      </div>
    );
  }

  // estado === "ativar"
  return (
    <div className={box}>
      <span className="text-lg">🔔</span>
      <p className="min-w-0 flex-1 text-sm font-medium">
        Ativar avisos de vencimento
      </p>
      <Button type="button" size="sm" disabled={busy} onClick={ativar}>
        {busy ? "Ativando..." : "Ativar"}
      </Button>
      {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}
