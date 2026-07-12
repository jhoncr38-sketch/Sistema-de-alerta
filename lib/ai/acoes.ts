// Server-only. "IA que age": quando o cliente pede um documento/boleto/folha ou
// quer ir a uma tela, o CÓDIGO busca no banco (seguro, real) e monta cartões de
// ação. A IA nunca inventa um botão — só age sobre o que existe de verdade.
//
// Fluxo: detectarAcoes(pergunta, companyId) -> AcaoCard[] (pode ser vazio). O
// endpoint passa esses cartões à IA como contexto ("AÇÕES DISPONÍVEIS") e os
// devolve ao front, que os renderiza como botões. Tudo por company_id (escopo).

import { docTypeLabel } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

/** Um cartão de ação mostrado no chat (botões). */
export type AcaoCard =
  | {
      tipo: "download";
      titulo: string; // "Mensalidade Julho"
      detalhe: string; // "R$ 450 · vence 10/07/2026"
      docId: string; // rota /api/documents/[id]/download
      // "boleto" mostra [Baixar boleto]; "documento" mostra [Visualizar][Baixar].
      variante: "boleto" | "documento" | "folha";
    }
  | {
      tipo: "navegar";
      titulo: string; // "Abrir faturamento"
      detalhe: string; // "Veja receita, tributos e tendências"
      href: string; // /portal/faturamento
    };

/** Palavras-chave -> destino de navegação. */
const NAV_INTENTS: { termos: RegExp; titulo: string; detalhe: string; href: string }[] = [
  {
    termos: /faturament|receita|cresciment|fatur/i,
    titulo: "Abrir faturamento",
    detalhe: "Receita, tributos e tendências",
    href: "/portal/faturamento",
  },
  {
    termos: /parcelament|refis|parcela/i,
    titulo: "Abrir parcelamentos",
    detalhe: "Seus planos e parcelas",
    href: "/portal/parcelamentos",
  },
  {
    termos: /reward|coins|pontos|n[íi]vel|missõ|misso/i,
    titulo: "Abrir SJ Rewards",
    detalhe: "Saldo, nível e benefícios",
    href: "/portal/rewards",
  },
];

/** Detecta se o cliente quer um DOCUMENTO institucional específico. */
const DOC_INTENTS: { termos: RegExp; types: DocType[] }[] = [
  { termos: /contrato\s*social/i, types: ["contrato_social"] },
  { termos: /cart[ãa]o\s*cnpj|cnpj/i, types: ["cartao_cnpj"] },
  { termos: /alvar[áa]/i, types: ["alvara"] },
  { termos: /licen[çc]a/i, types: ["licenca"] },
  { termos: /relat[óo]rio\s*fiscal/i, types: ["relatorio_fiscal"] },
];

/** Linha mínima de documento lida do banco. */
interface DocRow {
  id: string;
  type: DocType;
  categoria: string;
  competencia: string | null;
  descricao: string | null;
  amount: number | null;
  due_date: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
}

const DOC_COLS =
  "id,type,categoria,competencia,descricao,amount,due_date,file_path,file_name,created_at";

/** Nome amigável de um documento (usa descrição do "outro", senão o rótulo do tipo). */
function nomeDoc(d: DocRow): string {
  if (d.type === "outro" && d.descricao) return d.descricao;
  const base = docTypeLabel(d.type);
  if (d.competencia) return `${base} — ${d.competencia}`;
  return base;
}

/** Detalhe curto: valor + vencimento (guias) ou data de envio (documentos). */
function detalheDoc(d: DocRow): string {
  if (d.categoria === "boleto" || d.categoria === "parcelamento") {
    const partes: string[] = [];
    if (d.amount != null) partes.push(formatCurrency(d.amount));
    if (d.due_date) partes.push(`vence ${formatDate(d.due_date)}`);
    return partes.join(" · ");
  }
  return `Enviado em ${formatDate(d.created_at)}`;
}

/**
 * Detecta a intenção da pergunta e devolve cartões de ação (dados reais do
 * banco). Ordem: documento/boleto específico primeiro (mais útil), navegação
 * como reserva. Retorna no máximo `max` cartões para não poluir a resposta.
 */
export async function detectarAcoes(
  pergunta: string,
  companyId: string,
  max = 3,
): Promise<AcaoCard[]> {
  const q = pergunta.toLowerCase();
  const cards: AcaoCard[] = [];
  const supabase = createAdminClient();

  const quer2via = /2[ªa]?\s*via|segunda\s*via|baixar|download|boleto|guia|mensalidade/i.test(q);
  const querFolha = /folha/i.test(q);
  const docIntent = DOC_INTENTS.find((di) => di.termos.test(q));

  // ----- Documento institucional pedido (contrato, CNPJ, alvará...) -----
  if (docIntent) {
    // 1) Tenta pelo TIPO estruturado (ex.: type = "contrato_social").
    const { data: porTipo } = await supabase
      .from("documents")
      .select(DOC_COLS)
      .eq("company_id", companyId)
      .eq("categoria", "documento")
      .in("type", docIntent.types)
      .not("file_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(2);

    let achados = (porTipo ?? []) as DocRow[];

    // 2) Fallback: muitos documentos são publicados como "Outro" com o nome só
    // na descrição (ex.: "2ª Aditivo Contratual", "Alvará de Licença"). Se o
    // tipo não achou nada, procura entre os institucionais e casa a mesma
    // intenção contra a descrição / nome do arquivo.
    if (achados.length === 0) {
      const { data: institucionais } = await supabase
        .from("documents")
        .select(DOC_COLS)
        .eq("company_id", companyId)
        .eq("categoria", "documento")
        .not("file_path", "is", null)
        .order("created_at", { ascending: false });
      achados = ((institucionais ?? []) as DocRow[])
        .filter((d) =>
          docIntent.termos.test(
            `${d.descricao ?? ""} ${d.file_name ?? ""} ${nomeDoc(d)}`,
          ),
        )
        .slice(0, 2);
    }

    for (const d of achados) {
      cards.push({
        tipo: "download",
        titulo: nomeDoc(d),
        detalhe: detalheDoc(d),
        docId: d.id,
        variante: "documento",
      });
    }
  }

  // ----- Folha pedida -----
  if (querFolha && cards.length < max) {
    const { data } = await supabase
      .from("documents")
      .select(DOC_COLS)
      .eq("company_id", companyId)
      .eq("categoria", "folha")
      .not("file_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    for (const d of (data ?? []) as DocRow[]) {
      cards.push({
        tipo: "download",
        titulo: nomeDoc(d),
        detalhe: detalheDoc(d),
        docId: d.id,
        variante: "folha",
      });
    }
  }

  // ----- Boleto / 2ª via / mensalidade -----
  if (quer2via && !docIntent && cards.length < max) {
    // Se citou "mensalidade", prioriza esse tipo; senão, guias em aberto.
    const querMensalidade = /mensalidade/i.test(q);
    let query = supabase
      .from("documents")
      .select(DOC_COLS)
      .eq("company_id", companyId)
      .in("categoria", ["boleto", "parcelamento"])
      .not("file_path", "is", null);
    query = querMensalidade
      ? query.eq("type", "mensalidade")
      : query.eq("status", "open");
    const { data } = await query
      .order("due_date", { ascending: true })
      .limit(3);
    for (const d of (data ?? []) as DocRow[]) {
      if (cards.length >= max) break;
      cards.push({
        tipo: "download",
        titulo: nomeDoc(d),
        detalhe: detalheDoc(d),
        docId: d.id,
        variante: "boleto",
      });
    }
  }

  // ----- Navegação (reserva, quando nada acima casou) -----
  if (cards.length === 0) {
    const nav = NAV_INTENTS.find((n) => n.termos.test(q));
    if (nav) {
      cards.push({
        tipo: "navegar",
        titulo: nav.titulo,
        detalhe: nav.detalhe,
        href: nav.href,
      });
    }
  }

  return cards.slice(0, max);
}

/** Resumo textual das ações para a IA citar (sem inventar). Vazio se não há. */
export function acoesParaContexto(cards: AcaoCard[]): string {
  if (cards.length === 0) return "";
  const linhas = cards.map((c) =>
    c.tipo === "download"
      ? `- ${c.titulo} (${c.detalhe}) — há um botão de download disponível`
      : `- ${c.titulo} (${c.detalhe}) — há um botão para abrir a tela`,
  );
  return (
    "AÇÕES DISPONÍVEIS (o cliente verá botões abaixo da sua resposta; " +
    "mencione que encontrou e que ele pode usar o botão, sem repetir links):\n" +
    linhas.join("\n")
  );
}
