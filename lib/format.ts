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

/**
 * "Último acesso" em texto relativo e curto, do ponto de vista de hoje:
 * "hoje", "ontem", "há 3 dias", "há 2 semanas", "há 5 meses". Recebe o
 * last_sign_in_at (ISO) do Supabase Auth; null/ausente vira "nunca acessou".
 */
export function formatUltimoAcesso(
  value: string | null | undefined,
  agora: number = Date.now(),
): string {
  if (!value) return "Nunca acessou";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "—";

  const dias = Math.floor((agora - then.getTime()) / 86_400_000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 7) return `Há ${dias} dias`;
  if (dias < 14) return "Há 1 semana";
  if (dias < 30) return `Há ${Math.floor(dias / 7)} semanas`;
  if (dias < 60) return "Há 1 mês";
  if (dias < 365) return `Há ${Math.floor(dias / 30)} meses`;
  const anos = Math.floor(dias / 365);
  return anos === 1 ? "Há 1 ano" : `Há ${anos} anos`;
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
