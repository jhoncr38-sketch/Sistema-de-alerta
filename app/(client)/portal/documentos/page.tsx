import Link from "next/link";
import { Download } from "lucide-react";
import { DocumentRequestUpload } from "@/components/document-request-upload";
import { DocumentsTable } from "@/components/documents-table";
import { FolhaView, type FolhaArquivo } from "@/components/portal/folha-view";
import { PortalHeader } from "@/components/portal/portal-header";
import { getActiveCompanyId } from "@/lib/companies";
import { competenciaKey, currentCompetenciaKey, getUrgency } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { diaMesTs } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRequest, DocumentWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";

type Aba = "folha" | "empresa" | "enviados";

const ABAS: { key: Aba; rotulo: string }[] = [
  { key: "folha", rotulo: "Folha" },
  { key: "empresa", rotulo: "Empresa" },
  { key: "enviados", rotulo: "Enviados" },
];

/** Nome do arquivo sem a extensão e a extensão em maiúsculas ("PDF"). */
function partesArquivo(fileName: string | null): { nome: string; ext: string } {
  const f = fileName ?? "";
  const ponto = f.lastIndexOf(".");
  if (ponto <= 0) return { nome: f || "Arquivo", ext: "Arquivo" };
  return { nome: f.slice(0, ponto), ext: f.slice(ponto + 1).toUpperCase() };
}

export default async function PortalDocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const aba: Aba = tab === "empresa" || tab === "enviados" ? tab : "folha";

  const supabase = await createClient();
  // RLS limita às empresas do cliente; aqui filtramos a empresa ativa.
  const companyId =
    (await getActiveCompanyId()) ?? "00000000-0000-0000-0000-000000000000";

  const [{ data: folhaData }, { data: docsData }, { data: reqData }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id,file_name,competencia,created_at,first_viewed_at")
        .eq("categoria", "folha")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      aba === "empresa"
        ? supabase
            .from("documents")
            .select("*, company:companies(id,razao_social,nome_fantasia,email)")
            .eq("categoria", "documento")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("document_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

  const folha: FolhaArquivo[] = (
    (folhaData ?? []) as Pick<
      DocumentWithCompany,
      "id" | "file_name" | "competencia" | "created_at" | "first_viewed_at"
    >[]
  )
    .map((d) => {
      const { nome, ext } = partesArquivo(d.file_name);
      return {
        id: d.id,
        nome,
        extensao: ext,
        compKey: (d.competencia && competenciaKey(d.competencia)) || d.created_at.slice(0, 7),
        publicadoEm: diaMesTs(d.created_at),
        novo: !d.first_viewed_at,
      };
    });

  const requests = (reqData ?? []) as DocumentRequest[];
  const pendentes = requests.filter((r) => r.status !== "submitted");
  const enviados = requests.filter((r) => r.status === "submitted");

  // URLs assinadas (1h) dos arquivos que o cliente já enviou.
  const signed = new Map<string, string>();
  if (aba === "enviados") {
    const paths = enviados.map((r) => r.file_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data: urls } = await supabase.storage.from("boletos").createSignedUrls(paths, 3600);
      for (const s of urls ?? []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
    }
  }

  return (
    <>
      <PortalHeader title="Documentos e folha" tela={aba === "folha" ? "folha" : "documentos"} />
      <div className="flex flex-col gap-3 px-4 pt-5 pb-10 sm:px-6">
        {/* Pedidos do contador (celular; no desktop ficam em Mais → Solicitações). */}
        {pendentes.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-amber-300 bg-card md:hidden dark:border-amber-800">
            <div className="bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Seu contador pediu {pendentes.length}{" "}
              {pendentes.length === 1 ? "documento" : "documentos"}
            </div>
            {pendentes.map((r) => {
              const vencido = r.due_date
                ? getUrgency(r.due_date, "open").urgency === "vencido"
                : false;
              return (
                <div key={r.id} className="border-t border-amber-200 px-3.5 py-2.5 dark:border-amber-900/60">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.due_date ? (
                        <>
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              vencido ? "bg-red-600" : "bg-amber-600",
                            )}
                          />
                          <span className={vencido ? "text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-400"}>
                            Prazo {formatDayMonth(r.due_date)}
                          </span>
                        </>
                      ) : (
                        "Sem prazo"
                      )}
                    </span>
                    <DocumentRequestUpload id={r.id} submitted={false} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Abas finas */}
        <div role="tablist" className="flex w-full rounded-lg bg-muted p-[3px] sm:w-fit">
          {ABAS.map((a) => (
            <Link
              key={a.key}
              href={a.key === "folha" ? "/portal/documentos" : `/portal/documentos?tab=${a.key}`}
              role="tab"
              aria-selected={aba === a.key}
              scroll={false}
              className={cn(
                "inline-flex h-7 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap sm:flex-none",
                aba === a.key
                  ? "bg-card font-semibold shadow-sm"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {a.rotulo}
              {a.key === "enviados" && enviados.length > 0 ? (
                <span className="ml-1.5 font-medium text-muted-foreground tabular-nums">
                  {enviados.length}
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        {aba === "folha" ? (
          <FolhaView arquivos={folha} mesAtual={currentCompetenciaKey()} />
        ) : aba === "empresa" ? (
          <DocumentsTable
            documents={(docsData ?? []) as DocumentWithCompany[]}
            showPreview
            showDownload
            showExplain
            emptyMessage="Nenhum documento disponível. Aqui ficam os documentos da empresa (cartão CNPJ, contrato social, alvará, licenças) publicados pelo seu contador."
          />
        ) : enviados.length === 0 ? (
          <div className="rounded-[10px] border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Você ainda não enviou documentos. Quando seu contador pedir algo, você
            envia por aqui ou em Solicitações.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border bg-card">
            {enviados.map((r, i) => {
              const url = r.file_path ? signed.get(r.file_path) : null;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3.5 py-2.5 sm:h-[46px] sm:py-0",
                    i > 0 && "border-t",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.file_name ?? "Arquivo"}
                      {r.submitted_at ? ` · enviado ${diaMesTs(r.submitted_at)}` : ""}
                    </div>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir arquivo enviado"
                      aria-label={`Abrir ${r.title}`}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Download className="size-4" />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
