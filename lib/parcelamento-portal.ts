import { getUrgency } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { diaMesTs, emDias, haDias, mesNome, MESES_CURTOS, situacaoGuia, type Situacao } from "@/lib/portal";
import type { DocumentRow } from "@/lib/types";

/**
 * Leitura de um parcelamento para o portal do cliente (redesenho 10a): estado
 * de cada parcela no mapa, parcelas relevantes, saldo restante e término.
 */

export type EstadoParcela = "paga" | "atrasada" | "proxima" | "contador" | "a_vir";

export interface CelulaParcela {
  num: number;
  estado: EstadoParcela;
  /** Tooltip: "Parcela 23 · 30/09 · R$ 318,40". */
  dica: string;
}

export interface ParcelaRelevante {
  id: string | null; // null = parcela ainda não lançada
  num: number;
  situacao: Situacao;
  /** "Atrasada" / "A pagar" / "A vir" / "Com o contador". */
  rotulo: string;
  /** Classe do ponto e do rótulo. */
  tom: "red" | "primary" | "muted" | "amber";
  detalhe: string;
  valor: number | null;
  temArquivo: boolean;
  exigeComprovante: boolean;
  /** Texto no lugar das ações ("guia sai em novembro", "2ª via pedida"). */
  nota: string | null;
}

export interface LeituraPlano {
  pagas: number;
  total: number;
  pct: number;
  atrasadas: number;
  /** 1ª parcela atrasada (para o selo do mini-cartão). */
  primeiraAtrasada: DocumentRow | null;
  /** Próxima parcela em aberto dentro do prazo. */
  proxima: DocumentRow | null;
  valorParcela: number | null;
  saldo: number;
  restantes: number;
  /** "set/2031" ou null. */
  terminaEm: string | null;
  quitadoEm: string | null; // "15/08"
  semComprovante: number;
  celulas: CelulaParcela[];
  relevantes: ParcelaRelevante[];
  /** Data de vencimento mais urgente em aberto (para escolher o plano padrão). */
  urgencia: string | null;
}

const fmtValor = (v: number | null) =>
  v == null
    ? ""
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Soma `n` meses a uma data ISO (YYYY-MM-DD) e devolve "mmm/AAAA". */
function mesAnoMais(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${MESES_CURTOS[d.getMonth()]}/${d.getFullYear()}`;
}

export function lerPlano(
  total: number,
  parcelas: DocumentRow[],
  reissue: ReadonlyMap<string, string>,
  debitoAutomatico: boolean,
): LeituraPlano {
  const ids = new Set(reissue.keys());
  const porNum = new Map<number, DocumentRow>();
  for (const p of parcelas) if (p.parcela_num) porNum.set(p.parcela_num, p);
  const sit = (p: DocumentRow) => situacaoGuia(p, ids);

  const ordenadas = [...parcelas].sort((a, b) => (a.parcela_num ?? 0) - (b.parcela_num ?? 0));
  const pagas = parcelas.filter((p) => p.status === "paid").length;
  const atrasadasLista = ordenadas.filter((p) => sit(p) === "precisa");
  const abertasNoPrazo = ordenadas
    .filter((p) => sit(p) === "a_pagar" && p.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const proxima = abertasNoPrazo[0] ?? null;

  const valorParcela =
    proxima?.amount ??
    [...ordenadas].reverse().find((p) => p.amount != null)?.amount ??
    null;

  const naoPagas = parcelas.filter((p) => p.status !== "paid");
  const faltamLancar = Math.max(total - parcelas.length, 0);
  const saldo =
    naoPagas.reduce((s, p) => s + (p.amount ?? 0), 0) + faltamLancar * (valorParcela ?? 0);
  const restantes = Math.max(total - pagas, 0);

  // Término: vencimento da última parcela; se nem todas foram lançadas, projeta
  // mês a mês a partir da última conhecida.
  const comData = ordenadas.filter((p) => p.due_date && p.parcela_num);
  const ultima = comData[comData.length - 1] ?? null;
  const terminaEm = ultima
    ? mesAnoMais(ultima.due_date!, Math.max(total - (ultima.parcela_num ?? total), 0))
    : null;

  const quitado = total > 0 && pagas >= total;
  const ultimaPaga = [...ordenadas]
    .filter((p) => p.status === "paid")
    .sort((a, b) => ((a.paid_at ?? "") < (b.paid_at ?? "") ? 1 : -1))[0];
  const quitadoEm = quitado && ultimaPaga
    ? ultimaPaga.paid_at
      ? diaMesTs(ultimaPaga.paid_at)
      : ultimaPaga.due_date
        ? formatDayMonth(ultimaPaga.due_date)
        : null
    : null;

  // ----- Mapa -----
  const celulas: CelulaParcela[] = [];
  for (let n = 1; n <= total; n++) {
    const p = porNum.get(n);
    let estado: EstadoParcela = "a_vir";
    if (p) {
      const s = sit(p);
      estado =
        s === "pago"
          ? "paga"
          : s === "precisa"
            ? "atrasada"
            : s === "contador"
              ? "contador"
              : p.id === proxima?.id
                ? "proxima"
                : "a_vir";
    }
    const partes = [`Parcela ${n}`];
    if (p?.due_date) partes.push(formatDayMonth(p.due_date));
    if (p?.amount != null) partes.push(fmtValor(p.amount));
    celulas.push({ num: n, estado, dica: partes.join(" · ") });
  }

  // ----- Parcelas relevantes: atrasadas + próxima + seguinte -----
  const relevantes: ParcelaRelevante[] = [];
  const montar = (n: number, p: DocumentRow | undefined, aVir: boolean): ParcelaRelevante => {
    if (!p) {
      return {
        id: null, num: n, situacao: "a_pagar", rotulo: "A vir", tom: "muted",
        detalhe: "", valor: valorParcela, temArquivo: false, exigeComprovante: false,
        nota: "guia ainda não lançada",
      };
    }
    const s = sit(p);
    const base = {
      id: p.id, num: n, situacao: s, valor: p.amount, temArquivo: !!p.file_path,
      exigeComprovante: p.exige_comprovante,
    };
    if (s === "contador") {
      const pedida = reissue.get(p.id);
      return {
        ...base, rotulo: "Com o contador", tom: "amber", detalhe: "",
        nota: p.status === "aguardando"
          ? p.comprovante_at ? `comprovante enviado ${diaMesTs(p.comprovante_at)}` : "pagamento informado"
          : pedida ? `2ª via pedida ${diaMesTs(pedida)}` : "2ª via pedida",
      };
    }
    const venc = p.due_date ? formatDayMonth(p.due_date) : "";
    const days = p.due_date ? getUrgency(p.due_date, p.status).days : 0;
    if (s === "precisa") {
      return { ...base, rotulo: "Atrasada", tom: "red", detalhe: `venceu ${venc}, ${haDias(days)}`, nota: null };
    }
    if (aVir) {
      const mes = p.due_date ? mesNome(Number(p.due_date.slice(5, 7))) : "";
      return {
        ...base, rotulo: "A vir", tom: "muted",
        detalhe: debitoAutomatico ? `débito em ${venc}` : venc,
        nota: debitoAutomatico ? null : p.file_path ? null : mes ? `guia sai em ${mes}` : null,
      };
    }
    return {
      ...base, rotulo: "A pagar", tom: "primary",
      detalhe: debitoAutomatico
        ? `débito em ${venc}`
        : days === 0 ? "vence hoje" : `${venc}, ${emDias(days)}`,
      nota: null,
    };
  };
  for (const p of atrasadasLista) relevantes.push(montar(p.parcela_num ?? 0, p, false));
  // Parcelas "com o contador" também aparecem (o cliente acompanha).
  for (const p of ordenadas.filter((x) => sit(x) === "contador")) {
    relevantes.push(montar(p.parcela_num ?? 0, p, false));
  }
  if (proxima?.parcela_num) {
    relevantes.push(montar(proxima.parcela_num, proxima, false));
    const seg = proxima.parcela_num + 1;
    if (seg <= total && !relevantes.some((r) => r.num === seg)) {
      relevantes.push(montar(seg, porNum.get(seg), true));
    }
  }
  relevantes.sort((a, b) => a.num - b.num);

  const urgencia =
    atrasadasLista[0]?.due_date ?? proxima?.due_date ?? null;

  return {
    pagas,
    total,
    pct: total > 0 ? Math.round((pagas / total) * 100) : 0,
    atrasadas: atrasadasLista.length,
    primeiraAtrasada: atrasadasLista[0] ?? null,
    proxima,
    valorParcela,
    saldo,
    restantes,
    terminaEm,
    quitadoEm,
    semComprovante: parcelas.filter((p) => p.status === "paid" && !p.comprovante_path).length,
    celulas,
    relevantes,
    urgencia,
  };
}
