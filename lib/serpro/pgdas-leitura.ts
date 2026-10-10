/**
 * Leitura do PDF de uma declaração do PGDAS-D já transmitida (texto extraído
 * com unpdf, sem IA). Serve para trazer o que a Receita já tem guardado:
 * a folha de salários e as receitas dos meses anteriores (base do fator “r”).
 *
 * O PDF traz, entre outras, as seções:
 *   "Período de Apuração: 01/08/2026 a 31/08/2026"
 *   "Receita Bruta do PA (RPA) - Competência 71.113,76 0,00 71.113,76"
 *   "2.2.1) Mercado Interno"  → "08/2025 54.652,36 09/2025 63.951,47 …"
 *   "2.2.2) Mercado Externo"
 *   "2.3) Folha de Salários Anteriores (R$)" → "08/2025 16.794,23 …" ou "Nenhuma"
 *   "2.4) Fator r" → "Fator r = 0,31 - Anexo III" ou "Não se aplica"
 */

export interface ValorDoMes {
  /** AAAAMM. */
  pa: string;
  valor: number;
}

export interface DeclaracaoLida {
  /** Período da declaração lida (AAAAMM). */
  pa: string | null;
  /** Receita do próprio período (interno + externo). */
  receitaPa: number | null;
  /** Receitas dos meses anteriores (interno + externo), como a Receita guarda. */
  receitas: ValorDoMes[];
  /** Folha de salários dos meses anteriores (vazio = "Nenhuma"). */
  folhas: ValorDoMes[];
  /** "0,31 - Anexo III", quando a declaração teve fator “r”. */
  fatorR: string | null;
}

/** "71.113,76" → 71113.76 */
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Trecho do texto entre dois marcadores (o 2º é opcional). */
function trecho(texto: string, inicio: RegExp, fim: RegExp): string {
  const i = texto.search(inicio);
  if (i < 0) return "";
  const resto = texto.slice(i);
  const f = resto.slice(1).search(fim);
  return f < 0 ? resto : resto.slice(0, f + 1);
}

/** Todos os pares "MM/AAAA valor" de um trecho. */
function paresMesValor(t: string): ValorDoMes[] {
  return [...t.matchAll(/(\d{2})\/(\d{4})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => ({
    pa: `${m[2]}${m[1]}`,
    valor: numero(m[3]),
  }));
}

export function lerDeclaracaoPgdas(texto: string): DeclaracaoLida {
  const per = texto.match(/Per[ií]odo de Apura[cç][aã]o:\s*\d{2}\/(\d{2})\/(\d{4})/i);
  const rpa = texto.match(/Receita Bruta do PA \(RPA\)[^\d]*([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);

  const interno = paresMesValor(trecho(texto, /2\.2\.1\)/, /2\.2\.2\)/));
  const externo = paresMesValor(trecho(texto, /2\.2\.2\)/, /2\.3\)/));
  const porMes = new Map<string, number>();
  for (const r of [...interno, ...externo]) porMes.set(r.pa, (porMes.get(r.pa) ?? 0) + r.valor);

  const folhas = paresMesValor(trecho(texto, /2\.3\)\s*Folha/i, /2\.3\.1\)|2\.4\)/));
  const fator = texto.match(/Fator r\s*=\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  return {
    pa: per ? `${per[2]}${per[1]}` : null,
    receitaPa: rpa ? numero(rpa[3]) : null,
    receitas: [...porMes].map(([pa, valor]) => ({ pa, valor })).sort((a, b) => a.pa.localeCompare(b.pa)),
    folhas: folhas.sort((a, b) => a.pa.localeCompare(b.pa)),
    fatorR: fator && !/n[aã]o se aplica/i.test(fator) ? fator : null,
  };
}
