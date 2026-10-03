import { cache } from "react";
import { getUrgency } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/** Situação resumida de uma empresa, para o seletor de empresa e o menu. */
export interface EmpresaAlerta {
  /** Guias a pagar (boletos + parcelas) vencidas e em aberto. */
  vencidos: number;
  /** Só boletos vencidos (badge de "Meus boletos"). */
  boletosVencidos: number;
  /** Dias até a próxima guia que vence em até 3 dias (null = nenhuma). */
  venceEmDias: number | null;
}

/**
 * Conta, por empresa, as guias vencidas e as que vencem em até 3 dias. Uma
 * consulta só (RLS limita às empresas do cliente). cache(): layout e cabeçalho
 * usam o mesmo resultado no request (cache() compara argumentos por
 * identidade, por isso a chave é a lista de ids em texto).
 */
const alertasPorChave = cache(
  async (chave: string): Promise<Record<string, EmpresaAlerta>> => {
    const companyIds = chave ? chave.split(",") : [];
    const out: Record<string, EmpresaAlerta> = {};
    for (const id of companyIds) {
      out[id] = { vencidos: 0, boletosVencidos: 0, venceEmDias: null };
    }
    if (companyIds.length === 0) return out;

    const limite = new Date();
    limite.setDate(limite.getDate() + 3);
    const limiteIso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;

    const supabase = await createClient();
    const { data } = await supabase
      .from("documents")
      .select("company_id,categoria,status,due_date")
      .in("company_id", companyIds)
      .in("categoria", ["boleto", "parcelamento"])
      .eq("status", "open")
      .lte("due_date", limiteIso);

    for (const d of (data ?? []) as {
      company_id: string;
      categoria: string;
      status: "open";
      due_date: string | null;
    }[]) {
      const a = out[d.company_id];
      if (!a || !d.due_date) continue;
      const { urgency, days } = getUrgency(d.due_date, d.status);
      if (urgency === "vencido") {
        a.vencidos++;
        if (d.categoria === "boleto") a.boletosVencidos++;
      } else if (a.venceEmDias === null || days < a.venceEmDias) {
        a.venceEmDias = days;
      }
    }
    return out;
  },
);

export function getAlertasEmpresas(
  companyIds: string[],
): Promise<Record<string, EmpresaAlerta>> {
  return alertasPorChave([...companyIds].sort().join(","));
}
