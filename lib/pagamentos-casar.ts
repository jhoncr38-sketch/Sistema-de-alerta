/**
 * Pagamentos na Receita × guias do portal — a parte "pura" (sem banco, sem
 * rede): ler o retorno do PAGTOWEB, achar o número do documento no texto de um
 * PDF e casar cada pagamento com a guia certa.
 *
 * Sem imports com "@/": dá para testar com `node` direto.
 */

/** Um pagamento (documento de arrecadação pago) como a Receita mostra. */
export interface PagamentoReceita {
  /** Número do documento (DAS/DARF), só dígitos. */
  numeroDocumento: string;
  /** "DAS", "DARF", "DAE", "DJE"... (abreviado, maiúsculo). */
  tipo: string;
  /** Competências "MM/AAAA" do documento e dos desmembramentos. */
  periodos: string[];
  /** Data em que o banco arrecadou (YYYY-MM-DD). */
  dataArrecadacao: string | null;
  dataVencimento: string | null;
  /** Valor pago (principal + multa + juros). */
  valorTotal: number;
  /** Códigos de receita (principal e desmembramentos). */
  receitas: string[];
}

const digitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** "2026-10-20T00:00:00Z" | "2026-10-20" | "20/10/2026" | "20261020" → "2026-10-20". */
export function dataIso(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  // Com hora: vale a DATA escrita (cortar evita virar o dia ao mudar de fuso).
  const isoComHora = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoComHora) return isoComHora[1];
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const compacta = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compacta) return `${compacta[1]}-${compacta[2]}-${compacta[3]}`;
  return null;
}

/** 1234.56 | "1234.56" | "1.234,56" → 1234.56 (0 se não der). */
function valor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-09-30" → "09/2026". Período anual/sem mês fica de fora. */
function competenciaDe(iso: string | null): string | null {
  if (!iso) return null;
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function textoDoTipo(t: unknown): string {
  if (t && typeof t === "object") {
    const o = t as Record<string, unknown>;
    return String(o.descricaoAbreviada ?? o.descricao ?? o.codigo ?? "").toUpperCase();
  }
  return String(t ?? "").toUpperCase();
}

function codigoDaReceita(r: unknown): string | null {
  if (r && typeof r === "object") {
    const c = (r as Record<string, unknown>).codigo;
    return c == null ? null : String(c);
  }
  return r == null ? null : String(r);
}

/**
 * Lê o `dados` do PAGAMENTOS71 (string JSON ou já objeto). A documentação
 * descreve uma LISTA de documentos; por segurança aceitamos também um objeto
 * que tenha a lista dentro, ou um único documento.
 */
export function lerPagamentos(dados: unknown): PagamentoReceita[] {
  let d: unknown = dados;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d || "[]");
    } catch {
      return [];
    }
  }
  let itens: unknown[] = [];
  if (Array.isArray(d)) itens = d;
  else if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if ("numeroDocumento" in o) itens = [o];
    else itens = (Object.values(o).find(Array.isArray) as unknown[] | undefined) ?? [];
  }

  const lista: PagamentoReceita[] = [];
  for (const raw of itens) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const numeroDocumento = digitos(it.numeroDocumento);
    if (!numeroDocumento) continue;

    const desm = Array.isArray(it.desmembramentos)
      ? (it.desmembramentos as Record<string, unknown>[])
      : [];
    const periodos = new Set<string>();
    const receitas = new Set<string>();
    const pa = competenciaDe(dataIso(it.periodoApuracao));
    if (pa) periodos.add(pa);
    const rp = codigoDaReceita(it.receitaPrincipal);
    if (rp) receitas.add(rp);
    for (const x of desm) {
      const p = competenciaDe(dataIso(x?.periodoApuracao));
      if (p) periodos.add(p);
      const r = codigoDaReceita(x?.receitaPrincipal);
      if (r) receitas.add(r);
    }

    lista.push({
      numeroDocumento,
      tipo: textoDoTipo(it.tipo),
      periodos: [...periodos],
      dataArrecadacao: dataIso(it.dataArrecadacao),
      dataVencimento: dataIso(it.dataVencimento),
      valorTotal: valor(it.valorTotal),
      receitas: [...receitas],
    });
  }
  return lista;
}

/**
 * Número do documento de arrecadação lido do TEXTO de um PDF de DAS/DARF. São
 * 17 dígitos, impressos como "07.20.26278.1234567-0". Devolve só os dígitos.
 */
export function numeroDocumentoDoTexto(texto: string): string | null {
  const formatado = texto.match(/(?<![\d.])(\d{2}\.\d{2}\.\d{5}\.\d{7}-\d)(?![\d.])/);
  if (formatado) return digitos(formatado[1]);
  const rotulo = texto.match(/N[úu]mero\s+(?:do\s+)?Documento\s*:?\s*([\d][\d.\-\s]{15,26}\d)/i);
  if (rotulo) {
    const n = digitos(rotulo[1]);
    if (n.length === 17) return n;
  }
  return null;
}

/**
 * Data-limite de pagamento lida do TEXTO de um PDF de DAS/DARF ("Pagar este
 * documento até 31/10/2026", "Pagar até: 31/10/2026", "Vencimento 31/10/2026").
 * Devolve YYYY-MM-DD ou null.
 */
export function vencimentoDoTexto(texto: string): string | null {
  const padroes = [
    /Pagar\s+(?:este\s+documento\s+)?at[ée]:?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    /Data\s+de\s+Vencimento:?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    /Vencimento:?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
  ];
  for (const re of padroes) {
    const m = texto.match(re);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

// ------------------------------------------------------------
// Casamento pagamento ↔ guia
// ------------------------------------------------------------

/** Como a guia é reconhecida na Receita. null = só pelo número do documento. */
export type TipoGuia = "das" | "darf" | "parcela" | null;

export interface GuiaParaCasar {
  id: string;
  tipoGuia: TipoGuia;
  /** "MM/AAAA" */
  competencia: string | null;
  valor: number | null;
  /** YYYY-MM-DD */
  vencimento: string | null;
  /** Só dígitos. */
  numeroDocumento: string | null;
}

/**
 * Por que a guia foi dada como paga:
 *  - numero: a Receita tem um pagamento com o MESMO número de documento da guia;
 *  - periodo_valor: mesmo tipo (DAS/DARF), mesma competência e mesmo valor;
 *  - periodo_valor_com_acrescimos: DAS da mesma competência pago DEPOIS do
 *    vencimento, com valor um pouco maior (multa/juros — guia regerada);
 *  - valor_data: parcela com o mesmo valor, paga perto do vencimento.
 */
export type Criterio =
  | "numero"
  | "periodo_valor"
  | "periodo_valor_com_acrescimos"
  | "valor_data";

export interface Casamento {
  guiaId: string;
  pagamento: PagamentoReceita;
  criterio: Criterio;
}

/** Diferença tolerada entre valor da guia e valor pago (arredondamento). */
const TOLERANCIA = 0.05;
/** DAS pago em atraso com guia regerada: até +35% (multa máx. 20% + juros). */
const ACRESCIMO_MAX = 1.35;
/** Parcela: pagamento entre 40 dias antes e 20 dias depois do vencimento. */
const PARCELA_ANTES_DIAS = 40;
const PARCELA_DEPOIS_DIAS = 20;

const DIA_MS = 86_400_000;
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);

function tipoCompativel(g: TipoGuia, p: PagamentoReceita): boolean {
  if (g === "das") return p.tipo.includes("DAS");
  if (g === "darf") return p.tipo.includes("DARF");
  if (g === "parcela") return p.tipo.includes("DAS") || p.tipo.includes("DARF");
  return false;
}

/**
 * Casa pagamentos da Receita com as guias em aberto de UMA empresa. Cada
 * pagamento serve para no máximo uma guia, e vice-versa. Primeiro pelo número
 * do documento (certeiro); depois, para as guias sem número que bata, por
 * tipo + competência + valor. Na dúvida, não casa — a guia segue como está.
 */
export function casarPagamentos(
  guias: GuiaParaCasar[],
  pagamentos: PagamentoReceita[],
): Casamento[] {
  const usados = new Set<string>();
  const feitas = new Set<string>();
  const casamentos: Casamento[] = [];
  const casar = (g: GuiaParaCasar, p: PagamentoReceita, criterio: Criterio) => {
    usados.add(p.numeroDocumento);
    feitas.add(g.id);
    casamentos.push({ guiaId: g.id, pagamento: p, criterio });
  };

  // 1) Pelo número do documento.
  for (const g of guias) {
    if (!g.numeroDocumento) continue;
    const p = pagamentos.find(
      (x) => !usados.has(x.numeroDocumento) && x.numeroDocumento === g.numeroDocumento,
    );
    if (p) casar(g, p, "numero");
  }

  // 2) Sem número que bata: tipo + competência + valor. Vencimento mais antigo
  //    primeiro (é o que o cliente costuma pagar antes).
  const resto = guias
    .filter((g) => !feitas.has(g.id) && g.tipoGuia && g.valor != null && g.valor > 0)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));

  for (const g of resto) {
    const valorGuia = g.valor as number;
    const livres = pagamentos.filter(
      (p) => !usados.has(p.numeroDocumento) && tipoCompativel(g.tipoGuia, p),
    );

    if (g.tipoGuia === "das" || g.tipoGuia === "darf") {
      if (!g.competencia) continue;
      const doMes = livres.filter((p) => p.periodos.includes(g.competencia as string));
      const exato = doMes.find((p) => Math.abs(p.valorTotal - valorGuia) <= TOLERANCIA);
      if (exato) {
        casar(g, exato, "periodo_valor");
        continue;
      }
      // Só o DAS: há um por mês, então o "pago com acréscimos" é seguro. O DARF
      // não — a DCTFWeb pode ter mais de um DARF no mesmo mês.
      if (g.tipoGuia === "das" && g.vencimento) {
        const venc = g.vencimento;
        const comAcrescimos = doMes.find(
          (p) =>
            p.valorTotal > valorGuia &&
            p.valorTotal <= valorGuia * ACRESCIMO_MAX &&
            !!p.dataArrecadacao &&
            p.dataArrecadacao > venc,
        );
        if (comAcrescimos) casar(g, comAcrescimos, "periodo_valor_com_acrescimos");
      }
      continue;
    }

    // Parcela: o período da Receita não é confiável para parcelas — casa por
    // valor exato e data de pagamento perto do vencimento (o mais próximo).
    if (g.tipoGuia === "parcela" && g.vencimento) {
      const venc = g.vencimento;
      const candidatos = livres
        .filter((p) => Math.abs(p.valorTotal - valorGuia) <= TOLERANCIA && !!p.dataArrecadacao)
        .map((p) => ({ p, dias: diasEntre(venc, p.dataArrecadacao as string) }))
        .filter((c) => c.dias >= -PARCELA_ANTES_DIAS && c.dias <= PARCELA_DEPOIS_DIAS)
        .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias));
      if (candidatos[0]) casar(g, candidatos[0].p, "valor_data");
    }
  }

  return casamentos;
}
