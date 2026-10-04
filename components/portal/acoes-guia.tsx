"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CircleCheck,
  Download,
  Loader2,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  payWithComprovante,
  requestBoletoReissue,
  toggleDocumentPaid,
} from "@/app/actions/documents";
import { gerarSegundaViaDas } from "@/app/(client)/portal/segunda-via-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Ações das guias no portal do cliente (redesenho):
 *   "Pedir 2ª via" (vencida) · "Baixar" (em dia) · "Já paguei" (comprovante).
 * Tamanhos: "lg" = botão do quadro do Início (h-9; h-11 no celular),
 *           "sm" = botão compacto das tabelas (h-7),
 *           "text" = link de texto azul (linhas do celular).
 */
export type AcaoTamanho = "lg" | "sm" | "text";

function classesAcao(tamanho: AcaoTamanho): string {
  if (tamanho === "text") {
    return "inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-60";
  }
  return cn(
    "inline-flex items-center justify-center gap-1.5 bg-primary font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
    tamanho === "lg"
      ? "h-11 flex-1 rounded-lg text-sm md:h-9"
      : "h-7 rounded-[7px] px-2.5 text-[13px]",
  );
}

/** "Pedir 2ª via" — registra o pedido e avisa o contador. */
export function PedirSegundaViaAcao({
  docId,
  tamanho = "lg",
}: {
  docId: string;
  tamanho?: AcaoTamanho;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (feito) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" />
        2ª via pedida
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={classesAcao(tamanho)}
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            try {
              await requestBoletoReissue(docId);
              setFeito(true);
              // Recarrega a lista: a guia passa para "Com o contador".
              router.refresh();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Não foi possível pedir agora.");
            }
          });
        }}
      >
        {tamanho !== "text" ? (
          pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )
        ) : null}
        Pedir 2ª via
      </button>
      {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
    </>
  );
}

/**
 * "Gerar 2ª via" — DAS vencido: o próprio cliente gera a guia atualizada na
 * Receita (multa e juros), que substitui a vencida no portal. Se não der, a
 * ação vira o pedido de 2ª via ao contador e avisa aqui.
 */
export function GerarSegundaViaAcao({
  docId,
  tamanho = "lg",
}: {
  docId: string;
  tamanho?: AcaoTamanho;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pedido, setPedido] = useState(false);

  if (pedido) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Check className="size-3.5" />
        2ª via pedida ao contador
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      className={classesAcao(tamanho)}
      onClick={() =>
        startTransition(async () => {
          const r = await gerarSegundaViaDas(docId);
          if (r.ok) {
            const valor =
              r.valor != null
                ? r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "";
            const ate = r.pagarAte ? r.pagarAte.split("-").reverse().join("/") : "";
            toast.success("2ª via gerada", {
              description: `${valor}${ate ? ` · pague até ${ate}` : ""}. Já está na sua lista.`,
            });
          } else if (r.pedidoAoContador) {
            setPedido(true);
            toast.message(r.mensagem);
          } else if (r.semDebito) {
            // Não é erro: a Receita não tem débito (provável já pago).
            toast.message("Nada a pagar na Receita", {
              description: r.mensagem,
              duration: 10_000,
            });
          } else {
            toast.error(r.mensagem);
          }
          // Recarrega a lista: guia nova (gerada) ou "Com o contador" (pedido).
          if (r.ok || r.pedidoAoContador) router.refresh();
        })
      }
    >
      {tamanho !== "text" ? (
        pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />
      ) : null}
      {pending ? "Gerando…" : "Gerar 2ª via"}
    </button>
  );
}

/** "Baixar" o boleto (no lugar do "Copiar código" enquanto a guia não guarda
 *  a linha digitável). */
export function BaixarGuiaAcao({
  docId,
  tamanho = "lg",
}: {
  docId: string;
  tamanho?: AcaoTamanho;
}) {
  return (
    <a href={`/api/documents/${docId}/download`} className={classesAcao(tamanho)}>
      {tamanho !== "text" ? <Download className="size-3.5" /> : null}
      Baixar
    </a>
  );
}

/**
 * "Já paguei": o cliente informa o pagamento. Abre o seletor de arquivo para
 * anexar o comprovante (no celular o seletor oferece a câmera). Se a guia não
 * exige comprovante, um menu deixa marcar como pago sem anexar.
 *   variante "link" = texto discreto ao lado do botão (Início)
 *   variante "icon" = só o clipe (tabelas)
 */
export function JaPagueiAcao({
  docId,
  exigeComprovante,
  variante = "link",
}: {
  docId: string;
  exigeComprovante: boolean;
  variante?: "link" | "icon";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setErro(null);
    startTransition(async () => {
      try {
        await payWithComprovante(docId, fd);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Falha ao enviar.");
      }
    });
  }

  function semComprovante() {
    setErro(null);
    startTransition(async () => {
      try {
        await toggleDocumentPaid(docId, true);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Falha ao atualizar.");
      }
    });
  }

  const icone = pending ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : (
    <>
      <Paperclip className={cn("size-3.5", variante === "link" && "hidden md:block")} />
      {variante === "link" ? <Camera className="size-3.5 md:hidden" /> : null}
    </>
  );

  const gatilhoClasse =
    variante === "link"
      ? "inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground disabled:opacity-60"
      : "inline-flex size-7 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60";

  const conteudo = (
    <>
      {icone}
      {variante === "link" ? "Já paguei" : null}
    </>
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*,application/pdf"
      className="hidden"
      onChange={onFile}
    />
  );

  return (
    <>
      {input}
      {exigeComprovante ? (
        <button
          type="button"
          disabled={pending}
          title="Já paguei: enviar comprovante"
          aria-label="Já paguei: enviar comprovante"
          className={gatilhoClasse}
          onClick={() => inputRef.current?.click()}
        >
          {conteudo}
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            title="Já paguei"
            aria-label="Já paguei"
            className={gatilhoClasse}
          >
            {conteudo}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              // Abre o seletor depois que o menu fecha (evita conflito de foco).
              onClick={() => setTimeout(() => inputRef.current?.click(), 10)}
            >
              <Paperclip />
              Enviar comprovante
            </DropdownMenuItem>
            <DropdownMenuItem onClick={semComprovante}>
              <CircleCheck />
              Marcar como pago sem comprovante
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {erro ? <span className="text-xs text-destructive">{erro}</span> : null}
    </>
  );
}
