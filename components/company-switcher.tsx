"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { setActiveCompany } from "@/app/(client)/actions";
import type { Company } from "@/lib/types";

/**
 * Seletor de empresa do cliente. Aparece SÓ quando ele tem 2+ empresas
 * (definidas pelo contador). Troca a empresa ativa e atualiza todo o portal.
 */
export function CompanySwitcher({
  companies,
  activeId,
}: {
  companies: Company[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (companies.length < 2) return null;

  return (
    <div className="px-2 pt-2">
      <label
        htmlFor="company-switcher"
        className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground"
      >
        <Building2 className="size-3.5" />
        Empresa
      </label>
      <select
        id="company-switcher"
        value={activeId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await setActiveCompany(id);
            router.refresh();
          });
        }}
        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome_fantasia || c.razao_social}
          </option>
        ))}
      </select>
    </div>
  );
}
