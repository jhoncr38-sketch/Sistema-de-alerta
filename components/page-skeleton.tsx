import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto genérico usado como fallback de carregamento (loading.tsx) das
 * telas internas. Imita o cabeçalho + cartões de métrica + tabela das páginas,
 * pra navegação parecer instantânea em vez de "travar" esperando o servidor.
 */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <>
      {/* Cabeçalho (casa com o PageHeader) */}
      <div className="flex items-center justify-between gap-4 border-b bg-card px-6 py-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="space-y-6 p-6">
        {/* Cartões de métrica */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Lista / tabela */}
        <Skeleton className="h-4 w-44" />
        <div className="space-y-2 rounded-xl border bg-card p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </>
  );
}
