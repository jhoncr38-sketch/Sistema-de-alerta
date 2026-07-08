import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renderizador de Markdown MÍNIMO e seguro (sem HTML arbitrário), para os textos
 * curtos que a IA gera: **negrito**, listas com "- " (ou "•"/"→") e quebras de
 * linha. Não usa dangerouslySetInnerHTML — monta React a partir do texto. O que
 * não for reconhecido é mostrado como texto normal.
 */

/** Aplica **negrito** dentro de uma linha, preservando o resto como texto. */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key++} className="ml-1 space-y-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.15em] text-muted-foreground">•</span>
            <span className="min-w-0">{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    // Título "## ..." / "### ..." — vira um subtítulo em negrito.
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flushList();
      blocks.push(
        <p key={key++} className="font-semibold">
          {renderInline(h[1])}
        </p>,
      );
      continue;
    }
    // Item de lista: "- ", "* ", "• " ou "→ ".
    const li = line.match(/^(?:[-*•]|→)\s+(.*)$/);
    if (li) {
      listItems.push(li[1]);
      continue;
    }
    flushList();
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
