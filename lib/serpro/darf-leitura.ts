/**
 * Leitura do DARF da DCTFWeb (texto extraído do PDF, sem IA). A Receita não
 * devolve valor/vencimento no serviço GERARGUIA31 — mas o PDF traz tudo:
 *   "Pagar até: 05/10/2026"  "Valor: 1.294,49"  a linha digitável e a
 *   composição (um tributo por linha: código, denominação, principal, multa,
 *   juros, total). Assim o contador não precisa digitar valor e vencimento.
 */

export interface ItemDarf {
  codigo: string;
  denominacao: string;
  total: number;
}

export interface DarfLido {
  /** Valor total do documento. */
  valor: number | null;
  /** "Pagar este documento até" (YYYY-MM-DD) — validade do valor calculado. */
  pagarAte: string | null;
  /** Linha digitável (só dígitos, 48). */
  linhaDigitavel: string | null;
  /** Tributos que entraram no DARF. */
  composicao: ItemDarf[];
}

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`;
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const iso = (d: string) => {
  const [dia, mes, ano] = d.split("/");
  return `${ano}-${mes}-${dia}`;
};

export function lerDarf(texto: string): DarfLido {
  const pagar = texto.match(/Pagar até:\s*(\d{2}\/\d{2}\/\d{4})/);
  const valor = texto.match(new RegExp(String.raw`Valor:\s*` + VALOR));
  const linha = texto.match(/(\d{11} \d \d{11} \d \d{11} \d \d{11} \d)/);
  const composicao: ItemDarf[] = [];
  const reItem = new RegExp(
    String.raw`^(\d{4})\s+(.+?)\s+` + [VALOR, VALOR, VALOR, VALOR].join(String.raw`\s+`) + "$",
  );
  for (const l of texto.split(/\r?\n/)) {
    const m = l.trim().match(reItem);
    if (m) composicao.push({ codigo: m[1], denominacao: m[2].trim(), total: num(m[6]) });
  }
  return {
    valor: valor ? num(valor[1]) : null,
    pagarAte: pagar ? iso(pagar[1]) : null,
    linhaDigitavel: linha ? linha[1].replace(/\D/g, "") : null,
    composicao,
  };
}
