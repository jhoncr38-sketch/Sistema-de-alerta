import { Download, FileClock, Info } from "lucide-react";
import { deleteDocumentRequest } from "@/app/actions/document-requests";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { NewDocumentRequestButton } from "@/components/new-document-request-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRequestWithCompany } from "@/lib/types";

export default async function AdminSolicitacoesPage() {
  const supabase = await createClient();

  const [{ data: companiesData }, { data: requestsData }] = await Promise.all([
    supabase
      .from("companies")
      .select("id,razao_social,nome_fantasia")
      .eq("active", true)
      .order("razao_social"),
    supabase
      .from("document_requests")
      .select("*, company:companies(id,razao_social,nome_fantasia)")
      .order("created_at", { ascending: false }),
  ]);

  const companies = companiesData ?? [];
  const requests = (requestsData ?? []) as DocumentRequestWithCompany[];

  // URLs assinadas (1h) para os arquivos já enviados.
  const paths = requests
    .map((r) => r.file_path)
    .filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage
      .from("boletos")
      .createSignedUrls(paths, 3600);
    for (const s of data ?? []) {
      if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
    }
  }

  const pendentes = requests.filter((r) => r.status !== "submitted").length;

  return (
    <>
      <PageHeader
        title="Solicitações de documentos"
        subtitle={`${requests.length} no total · ${pendentes} aguardando envio`}
      >
        <NewDocumentRequestButton companies={companies} />
      </PageHeader>

      <div className="space-y-3 p-6">
        {requests.length === 0 ? (
          <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Nenhuma solicitação ainda. Use “Solicitar documento” para pedir um
            arquivo a uma empresa.
          </div>
        ) : (
          requests.map((r) => {
            const submitted = r.status === "submitted";
            const url = r.file_path ? signed.get(r.file_path) : null;
            const company = r.company?.nome_fantasia || r.company?.razao_social;
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileClock className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {company}
                      {r.competencia ? ` · ${r.competencia}` : ""}
                      {r.due_date ? ` · prazo ${formatDate(r.due_date)}` : ""}
                    </p>
                    {r.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                  {submitted ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                      Enviado
                      {r.submitted_at ? ` · ${formatDate(r.submitted_at)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Aguardando</Badge>
                  )}
                  {url ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      title={r.file_name ?? "Baixar"}
                      render={
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <Download />
                          <span className="hidden sm:inline">Baixar</span>
                        </a>
                      }
                    />
                  ) : null}
                  <ConfirmDeleteButton
                    action={deleteDocumentRequest.bind(null, r.id)}
                    title="Excluir solicitação"
                    description={
                      <>
                        Remove a solicitação <strong>{r.title}</strong>
                        {submitted ? " e o arquivo enviado" : ""}. Não dá para
                        desfazer.
                      </>
                    }
                    successMessage="Solicitação excluída."
                  />
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          O cliente vê as solicitações em “Solicitações” no portal e envia o
          arquivo por lá. Envio no prazo rende SJ Coins no Clube SJ.
        </div>
      </div>
    </>
  );
}
