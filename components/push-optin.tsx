"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Botão de opt-in do Web Push, no portal do cliente. É totalmente opcional: se o
 * navegador não suportar, ou o cliente negar, o portal segue funcionando e os
 * avisos continuam chegando por e-mail. No iPhone, o push só existe com o app
 * instalado na tela inicial — nesse caso mostramos o passo a passo.
 */

type Estado =
  | "carregando"
  | "indisponivel" // navegador sem suporte (desktop antigo etc.)
  | "ios_instalar" // iPhone/iPad sem o PWA instalado
  | "negado" // usuário bloqueou nas configurações
  | "ativar" // pode ativar
  | "ativado"; // já inscrito neste aparelho

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
  const [plataforma, setPlataforma] = useState<"ios" | "android" | "desktop">(
    "desktop",
  );

  useEffect(() => {
    let alive = true;
    // useEffect só roda no cliente, então window/navigator existem aqui.
    const init = async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        !!VAPID_PUBLIC;

      const ua = navigator.userAgent;
      const isIOS =
        /iphone|ipad|ipod/i.test(ua) ||
        // iPad recente se identifica como Mac com tela sensível ao toque.
        (/macintosh/i.test(ua) && "ontouchend" in document);
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      const isAndroid = /android/i.test(ua);
      if (alive) {
        setPlataforma(isIOS ? "ios" : isAndroid ? "android" : "desktop");
      }

      if (!supported) {
        // iPhone no Safari (aba normal) não tem PushManager: oriente a instalar.
        if (alive) {
          setEstado(isIOS && !isStandalone ? "ios_instalar" : "indisponivel");
        }
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setEstado("negado");
        return;
      }

      // Mostra o card já; em paralelo confere se este aparelho já está inscrito
      // (sem travar a UI caso o service worker demore a ativar).
      if (alive) setEstado("ativar");
      try {
        const reg = await ensureRegistration();
        const sub = await reg.pushManager.getSubscription();
        if (sub && alive) setEstado("ativado");
      } catch {
        /* mantém "ativar" — a inscrição real acontece no clique */
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

  async function reverificar() {
    // Se o navegador ainda mostra "bloqueado" neste tab, recarrega para captar
    // a mudança feita nas configurações; senão, tenta ativar direto.
    if (Notification.permission === "denied") {
      window.location.reload();
      return;
    }
    await ativar();
  }

  if (estado === "carregando" || estado === "indisponivel") return null;

  const box =
    "rounded-xl border bg-muted/30 p-4 flex flex-wrap items-center gap-3";

  if (estado === "ios_instalar") {
    return (
      <div className={box}>
        <span className="text-lg">🔔</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Receba avisos de vencimento no iPhone</p>
          <p className="text-muted-foreground">
            Toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela
            de Início</strong>, abra o app pela tela inicial e ative os avisos.
          </p>
        </div>
      </div>
    );
  }

  if (estado === "negado") {
    const comoLiberar =
      plataforma === "ios"
        ? "Ajustes do iPhone → Notificações → S J Contábil → ative."
        : plataforma === "android"
          ? "Toque no cadeado na barra de endereço → Permissões → Notificações → Permitir."
          : "Clique no cadeado 🔒 na barra de endereço → Notificações → Permitir e recarregue a página.";
    return (
      <div className={box}>
        <span className="text-lg">🔕</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Avisos bloqueados neste aparelho</p>
          <p className="text-muted-foreground">
            Você bloqueou as notificações. Para reativar: {comoLiberar}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={reverificar}
        >
          {busy ? "..." : "Já liberei"}
        </Button>
        {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
      </div>
    );
  }

  if (estado === "ativado") {
    return (
      <div className={box}>
        <span className="text-lg">🔔</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Avisos de vencimento ativados</p>
          <p className="text-muted-foreground">
            Você receberá uma notificação neste aparelho quando um boleto estiver
            perto de vencer.
          </p>
        </div>
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
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Ativar avisos de vencimento</p>
        <p className="text-muted-foreground">
          Receba uma notificação neste aparelho quando um boleto estiver perto de
          vencer — além do e-mail.
        </p>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={ativar}>
        {busy ? "Ativando..." : "Ativar"}
      </Button>
      {erro ? <p className="w-full text-xs text-destructive">{erro}</p> : null}
    </div>
  );
}
