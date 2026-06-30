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

/** Tempo relativo em pt-BR: "agora", "há 5 min", "há 2h", "há 3 dias". */
export function formatRelativeTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  if (days < 60) return "há 1 mês";
  return `há ${Math.floor(days / 30)} meses`;
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
