import { FileClock, Info } from "lucide-react";
import { DocumentRequestUpload } from "@/components/document-request-upload";
import { PageHeader } from "@/components/page-header";
import { getClientCompanyContext } from "@/lib/companies";
import { getUrgency } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHIP_TONE = {
  danger: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  success:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground",
} as const;

export default async function PortalSolicitacoesPage() {
  const supabase = await createClient();
  const { active } = await getClientCompanyContext();
  const activeCompanyId = active?.id ?? null;
  // Só promete moedas se o clube estiver ligado para esta empresa.
  const clubEnabled = active?.rewards_enabled !== false;

  const { data } = await supabase
    .from("document_requests")
    .select("*")
    .eq("company_id", activeCompanyId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false });

  // Recompensa real por enviar no prazo — lê a ação "doc-no-prazo" (o mesmo valor
  // que o crédito usa). Regra oculta/apagada ou clube desligado → não promete nada.
  let docReward: number | null = null;
  if (clubEnabled) {
    const { data: rule, error } = await supabase
      .from("rewards_earn_rules")
      .select("coins,active")
      .eq("key", "doc-no-prazo")
      .maybeSingle();
    if (error) docReward = 100; // tabela ainda não migrada → valor padrão do código
    else if (rule?.active) docReward = rule.coins as number;
  }

  const requests = (data ?? []) as DocumentRequest[];

  // URLs assinadas (1h) para os arquivos já enviados (o cliente confere o que mandou).
  const paths = requests
    .map((r) => r.file_path)
    .filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage
      .from("boletos")
      .createSignedUrls(paths, 3600);
    for (const s of urls ?? []) {
      if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
    }
  }

  const pendentes = requests.filter((r) => r.status !== "submitted").length;

  return (
    <>
      <PageHeader
        title="Solicitações"
        subtitle={
          pendentes > 0
            ? `${pendentes} documento(s) aguardando seu envio`
            : "Documentos solicitados pelo seu contador"
        }
      />

      <div className="space-y-3 p-6">
        {requests.length === 0 ? (
          <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
            Nenhuma solicitação no momento. Quando seu contador pedir um
            documento, ele aparece aqui para você enviar.
          </div>
        ) : (
          requests.map((r) => {
            const submitted = r.status === "submitted";
            const url = r.file_path ? signed.get(r.file_path) : null;
            // Prazo colorido só enquanto pendente.
            const u = r.due_date ? getUrgency(r.due_date, "open") : null;
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
                    {r.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.competencia ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {r.competencia}
                        </span>
                      ) : null}
                      {r.due_date ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            submitted
                              ? CHIP_TONE.muted
                              : CHIP_TONE[u?.tone ?? "muted"],
                          )}
                        >
                          {submitted
                            ? `Prazo ${formatDate(r.due_date)}`
                            : u?.urgency === "vencido"
                              ? `Venceu ${formatDate(r.due_date)}`
                              : `Prazo ${formatDate(r.due_date)}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-auto">
                  <DocumentRequestUpload
                    id={r.id}
                    submitted={submitted}
                    fileName={r.file_name}
                    viewUrl={url}
                  />
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0" />
          {docReward != null ? (
            <span>
              Enviar dentro do prazo rende{" "}
              <strong className="font-medium">+{docReward} SJ Coins</strong> no
              Clube SJ. Formatos aceitos: PDF, imagem, planilha ou XML.
            </span>
          ) : (
            <span>Formatos aceitos: PDF, imagem, planilha ou XML.</span>
          )}
        </div>
      </div>
    </>
  );
}
