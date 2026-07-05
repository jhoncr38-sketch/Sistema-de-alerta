"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Assistente de dúvidas.
 *
 * `AssistentePanel` é a conversa em si (mensagens + campo), reutilizável.
 * `AssistenteChat` é o botão flutuante que abre esse painel — usado apenas na
 * aba Início (portal do cliente e painel do contador), não no site inteiro.
 *
 * Envia a pergunta para POST /api/assistente (o servidor valida sessão, aplica
 * o escopo e fala com a IA). A inteligência fica no servidor; aqui é só a
 * interface. Trata carregando, erro e falta de conexão (comum no PWA offline).
 */

interface Msg {
  autor: "voce" | "assistente";
  texto: string;
}

export type AssistenteScope = "cliente" | "contador";

const SUGESTOES: Record<AssistenteScope, string[]> = {
  cliente: [
    "Qual boleto vence primeiro?",
    "O que vence esta semana?",
    "Tenho algo vencido?",
    "Quanto paguei de imposto este mês?",
    "Quanto já paguei este ano?",
    "Como estão meus parcelamentos?",
  ],
  contador: [
    "Quais clientes têm boleto vencido?",
    "Quem tem guias a vencer esta semana?",
    "Há pagamentos aguardando confirmação?",
    "Qual empresa mais pagou este mês?",
    "Quanto meus clientes pagaram em impostos este mês?",
    "Quem está com parcelamento em risco?",
  ],
};

export function AssistentePanel({
  scope = "cliente",
  className,
}: {
  scope?: AssistenteScope;
  className?: string;
}) {
  const [pergunta, setPergunta] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, carregando]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || carregando) return;
    setPergunta("");
    setMsgs((m) => [...m, { autor: "voce", texto: q }]);
    setCarregando(true);

    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: q }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        resposta?: string;
        disponivel?: boolean;
        error?: string;
      };

      if (data.disponivel === false) {
        setIndisponivel(true);
        setMsgs((m) => [
          ...m,
          {
            autor: "assistente",
            texto:
              "O assistente ainda não está ativo. O contador precisa configurar a integração.",
          },
        ]);
        return;
      }

      if (!res.ok) {
        setMsgs((m) => [
          ...m,
          {
            autor: "assistente",
            texto: data.error || "Não consegui responder agora. Tente de novo.",
          },
        ]);
        return;
      }

      setMsgs((m) => [
        ...m,
        {
          autor: "assistente",
          texto: data.resposta || "Sem resposta. Tente reformular a pergunta.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          autor: "assistente",
          texto:
            "Sem conexão no momento. Verifique sua internet e tente novamente.",
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Conversa */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Olá! Pergunte o que quiser sobre seus boletos, impostos e
              vencimentos — pode digitar livremente ou tocar num exemplo:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES[scope].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.autor === "voce" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                  m.autor === "voce"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.texto}
              </div>
            </div>
          ))
        )}
        {carregando ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Pensando…
            </div>
          </div>
        ) : null}
        <div ref={fimRef} />
      </div>

      {/* Campo de pergunta */}
      {!indisponivel ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(pergunta);
          }}
          className="flex items-center gap-2 border-t p-3"
        >
          <input
            ref={inputRef}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder="Digite sua pergunta…"
            maxLength={300}
            className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!pergunta.trim() || carregando}
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </Button>
        </form>
      ) : (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Assistente indisponível no momento.
        </div>
      )}
    </div>
  );
}

/**
 * Botão flutuante que abre o assistente. Colocado só na aba Início.
 * Fechado: pílula com faísca + rótulo (o rótulo some no mobile, vira só ícone).
 */
export function AssistenteChat({ scope = "cliente" }: { scope?: AssistenteScope }) {
  const [aberto, setAberto] = useState(false);

  // Fecha com Esc.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente de dúvidas"}
        className={cn(
          "fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95",
          "bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-500 dark:to-amber-700",
          "md:right-6 md:bottom-6",
          aberto ? "size-13 justify-center" : "h-13 px-4",
        )}
      >
        {aberto ? (
          <X className="size-6" />
        ) : (
          <>
            <Sparkles className="size-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-nowrap">
              Dúvidas?
            </span>
          </>
        )}
      </button>

      {/* Painel do chat */}
      {aberto ? (
        <div
          className={cn(
            "fixed right-4 bottom-20 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl",
            "sm:w-96 md:right-6 md:bottom-24",
          )}
        >
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-amber-50 to-transparent px-4 py-3 dark:from-amber-950/30">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Bot className="size-5" />
            </span>
            <div>
              <div className="text-sm font-semibold">Assistente S J</div>
              <div className="text-xs text-muted-foreground">
                Tire dúvidas sobre suas guias
              </div>
            </div>
          </div>

          <AssistentePanel scope={scope} className="min-h-0 flex-1" />
        </div>
      ) : null}
    </>
  );
}
