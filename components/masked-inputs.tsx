"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Inputs com máscara para o padrão brasileiro. São controlados internamente
 * (mantêm o próprio estado) mas continuam com `name`, então funcionam tanto em
 * formulários client quanto em formulários de Server Action. O valor enviado já
 * sai formatado — os parsers do back-end (parseAmount / normalizeCompetencia)
 * aceitam esse formato.
 */

/** "12345678000190" -> "12.345.678/0001-90" (vai formatando enquanto digita). */
export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length >= 3) out += "." + d.slice(2, 5);
  if (d.length >= 6) out += "." + d.slice(5, 8);
  if (d.length >= 9) out += "/" + d.slice(8, 12);
  if (d.length >= 13) out += "-" + d.slice(12, 14);
  return out;
}

/** Dígitos como centavos -> "1.240,00" (estilo caixa eletrônico). */
export function maskCurrency(value: string): string {
  const d = value.replace(/\D/g, "");
  if (!d) return "";
  const n = Number(d) / 100;
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "62026" -> "06/2026". Mês de 1 dígito (2-9) ganha o zero automaticamente. */
export function maskCompetencia(value: string): string {
  let d = value.replace(/\D/g, "");
  // Mês só pode começar com 0 ou 1; se o 1º dígito é 2-9, é mês de 1 dígito.
  if (d.length === 1 && Number(d) >= 2) d = "0" + d;
  d = d.slice(0, 6);
  if (d.length <= 2) return d;
  return d.slice(0, 2) + "/" + d.slice(2);
}

type MaskedProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "defaultValue"
> & {
  /** Valor inicial (será formatado pela máscara). */
  defaultValue?: string;
};

function useMask(initial: string, format: (v: string) => string) {
  const [value, setValue] = useState(() => format(initial));
  return {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValue(format(e.target.value)),
  };
}

export function CnpjInput({ defaultValue = "", ...props }: MaskedProps) {
  const bind = useMask(defaultValue, maskCnpj);
  return <Input inputMode="numeric" placeholder="00.000.000/0001-00" {...props} {...bind} />;
}

export function CurrencyInput({ defaultValue = "", ...props }: MaskedProps) {
  const bind = useMask(defaultValue, maskCurrency);
  return <Input inputMode="decimal" {...props} {...bind} />;
}

export function CompetenciaInput({ defaultValue = "", ...props }: MaskedProps) {
  const bind = useMask(defaultValue, maskCompetencia);
  return <Input inputMode="numeric" placeholder="06/2026" {...props} {...bind} />;
}
