"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Building2 } from "lucide-react";

/**
 * Filtro por empresa que aplica AO TROCAR (sem botão "Filtrar"): atualiza o
 * query param `company` na URL e recarrega a lista no servidor. Preserva os
 * demais params. Reutilizável em qualquer tela do painel que liste por empresa.
 */
export function CompanyFilterSelect({
  options,
  value,
  allLabel = "Todas as empresas",
  allValue = "",
  paramName = "company",
}: {
  options: { id: string; label: string }[];
  value: string;
  allLabel?: string;
  /** Valor da 1ª opção ("todas"/"carteira"). "" remove o param da URL. */
  allValue?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    // "" => remove o param (volta ao padrão); qualquer outro valor é setado.
    if (next) params.set(paramName, next);
    else params.delete(paramName);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <label className="relative flex items-center gap-2">
      <span className="sr-only">Filtrar por empresa</span>
      <span className="pointer-events-none absolute left-2.5 text-muted-foreground [&_svg]:size-4">
        {pending ? <Loader2 className="animate-spin" /> : <Building2 />}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label="Filtrar parcelamentos por empresa"
        className="h-8 max-w-52 rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <option value={allValue}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
