import { Bell } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export function Brand({
  subtitle,
  name,
  logoUrl,
  size = "sm",
}: {
  subtitle?: string;
  /** Nome configurado pelo contador em Configurações. Padrão: ContAlert. */
  name?: string | null;
  /** Logo configurado pelo contador em Configurações. Sem logo, mostra o ícone padrão. */
  logoUrl?: string | null;
  /** "lg" = logo grande e centralizado (telas de login/cadastro). */
  size?: "sm" | "lg";
}) {
  if (size === "lg") {
    return (
      <div className="flex flex-col items-center gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name ?? APP_NAME}
            className="size-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bell className="size-8" />
          </div>
        )}
        <div className="text-center leading-tight">
          <div className="text-lg font-semibold">{name || APP_NAME}</div>
          <div className="text-xs text-muted-foreground">
            {subtitle ?? APP_TAGLINE}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name ?? APP_NAME}
          className="size-9 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bell className="size-5" />
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{name || APP_NAME}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {subtitle ?? APP_TAGLINE}
        </div>
      </div>
    </div>
  );
}
