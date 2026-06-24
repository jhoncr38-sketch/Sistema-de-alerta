/** Formata número como moeda brasileira: 1240 -> "R$ 1.240,00". */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Formata data ISO ("2026-06-20") como "20/06/2026". */
export function formatDate(value: string | Date): string {
  const d =
    value instanceof Date
      ? value
      : (() => {
          const [y, m, day] = value.split("T")[0].split("-").map(Number);
          return new Date(y, (m ?? 1) - 1, day ?? 1);
        })();
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

/** "20/06" — dia/mês curto, usado nas tabelas. */
export function formatDayMonth(value: string | Date): string {
  const d =
    value instanceof Date
      ? value
      : (() => {
          const [y, m, day] = value.split("T")[0].split("-").map(Number);
          return new Date(y, (m ?? 1) - 1, day ?? 1);
        })();
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}
