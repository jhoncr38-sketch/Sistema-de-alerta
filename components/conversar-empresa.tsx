"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import type { AcaoCard } from "@/lib/ai/acoes";
import type { BoasVindas } from "@/lib/ai/boas-vindas";
import { cn } from "@/lib/utils";

/**
 * Aba "Converse com sua empresa": central de conversa contínua (multi-turno).
 * Nunca abre vazia — começa com a saudação e os "achados do dia" (BoasVindas,
 * montadas no servidor). Mantém o histórico e envia para POST /api/conversar,
 * que valida sessão/escopo e fala com a IA. A IA também AGE: quando encontra um
 * documento/boleto/folha (ou uma tela relevante), devolve cartões de ação.
 */

interface Msg {
  autor: "voce" | "assistente";
  texto: string;
  acoes?: AcaoCard[];
}

/** Atalhos que preenchem/enviam uma pergunta pronta. */
const ATALHOS: { emoji: string; label: string; pergunta: string }[] = [
  { emoji: "💰", label: "Impostos", pergunta: "Quanto paguei de imposto este ano?" },
  { emoji: "💳", label: "Boletos", pergunta: "Tenho boletos vencidos?" },
  { emoji: "📊", label: "Faturamento", pergunta: "Como está meu faturamento?" },
  { emoji: "📅", label: "Vencimentos", pergunta: "O que vence esta semana?" },
  { emoji: "📄", label: "Documentos", pergunta: "Quais documentos tenho disponíveis?" },
  { emoji: "🏆", label: "Rewards", pergunta: "Quanto tenho no SJ Rewards?" },
  { emoji: "📈", label: "Crescimento", pergunta: "Meu faturamento cresceu?" },
];

/** Avatar da IA — marca "SJ" dourada ao lado das respostas. */
function IaAvatar() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-[0.7rem] font-bold text-amber-950 shadow-sm ring-1 ring-amber-300/50"
      aria-hidden
    >
      SJ
    </span>
  );
}

/** Cartão de ação: botão(ões) para baixar um documento ou abrir uma tela. */
function AcaoCartao({ acao }: { acao: AcaoCard }) {
  const Icon = acao.tipo === "navegar" ? ArrowUpRight : FileText;
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4.5">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{acao.titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{acao.detalhe}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {acao.tipo === "navegar" ? (
          <a
            href={acao.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ArrowUpRight className="size-3.5" />
            Abrir
          </a>
        ) : (
          <>
            {acao.variante === "documento" ? (
              <a
                href={`/api/documents/${acao.docId}/download?view=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <Eye className="size-3.5" />
                Ver
              </a>
            ) : null}
            <a
              href={`/api/documents/${acao.docId}/download`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="size-3.5" />
              Baixar
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export function ConversarEmpresa({ boasVindas }: { boasVindas: BoasVindas }) {
  const [pergunta, setPergunta] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, carregando]);

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || carregando) return;
    // Histórico ANTES de adicionar a nova pergunta (para o servidor ter contexto).
    const historico = msgs.slice(-8);
    setPergunta("");
    setMsgs((m) => [...m, { autor: "voce", texto: q }]);
    setCarregando(true);

    try {
      const res = await fetch("/api/conversar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: q, historico }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        resposta?: string;
        disponivel?: boolean;
        error?: string;
        acoes?: AcaoCard[];
      };

      if (data.disponivel === false) {
        setIndisponivel(true);
        setMsgs((m) => [
          ...m,
          {
            autor: "assistente",
            texto:
              "A conversa ainda não está ativa. O contador precisa configurar a integração de IA.",
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
          acoes: data.acoes,
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          autor: "assistente",
          texto: "Sem conexão no momento. Verifique sua internet e tente novamente.",
        },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  const iniciada = msgs.length > 0;

  return (
    // Ocupa a altura restante abaixo do PageHeader; a conversa rola, o rodapé fica fixo.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---- Área de conversa (rolável) ---- */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
          {/* Boas-vindas — herói compacto, nunca abre vazio */}
          <div className="flex gap-3">
            <IaAvatar />
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="text-sm leading-relaxed">
                <span className="font-semibold">{boasVindas.saudacao}!</span>{" "}
                Sou o assistente da {boasVindas.empresa}. Pergunte sobre impostos,
                boletos, documentos, faturamento, folha ou SJ Rewards.
              </p>
              {boasVindas.achados.length > 0 ? (
                <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Hoje eu encontrei
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {boasVindas.achados.map((a, i) => (
                      <li key={i} className="leading-snug">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          {/* Mensagens da conversa */}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3",
                m.autor === "voce" ? "justify-end" : "justify-start",
              )}
            >
              {m.autor === "assistente" ? <IaAvatar /> : null}
              <div
                className={cn(
                  "min-w-0",
                  m.autor === "voce" ? "max-w-[80%]" : "max-w-[85%] flex-1",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.autor === "voce"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.texto}
                </div>
                {/* Cartões de ação abaixo da resposta do assistente. */}
                {m.autor === "assistente" && m.acoes && m.acoes.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {m.acoes.map((a, j) => (
                      <AcaoCartao key={j} acao={a} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {carregando ? (
            <div className="flex gap-3">
              <IaAvatar />
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Pensando…
              </div>
            </div>
          ) : null}
          <div ref={fimRef} />
        </div>
      </div>

      {/* ---- Rodapé fixo: atalhos + campo ---- */}
      <div className="border-t bg-card/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3 sm:px-6">
          {!indisponivel ? (
            <>
              {/* Atalhos rápidos — some depois que a conversa começa, p/ dar espaço */}
              {!iniciada ? (
                <div className="flex flex-wrap gap-2">
                  {ATALHOS.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => enviar(a.pergunta)}
                      disabled={carregando}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <span aria-hidden>{a.emoji}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar(pergunta);
                }}
                className="flex items-center gap-2 rounded-2xl border bg-background p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring/40"
              >
                <input
                  ref={inputRef}
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  placeholder="Pergunte qualquer coisa…"
                  maxLength={300}
                  className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm outline-none"
                />
                <button
                  type="submit"
                  disabled={!pergunta.trim() || carregando}
                  aria-label="Enviar"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="size-4" />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </form>
            </>
          ) : (
            <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Sparkles className="mr-1.5 inline size-4" />
              Conversa indisponível no momento. Fale com seu contador.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
