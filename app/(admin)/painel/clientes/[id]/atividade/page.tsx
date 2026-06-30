import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime, formatDate } from "@/lib/format";
import { EVENT_LABEL, type ClientEventType } from "@/lib/track";
import type { Profile } from "@/lib/types";

interface EventRow {
  id: string;
  event_type: ClientEventType;
  company_id: string | null;
  plan_id: string | null;
  created_at: string;
  company: { razao_social: string; nome_fantasia: string | null } | null;
}

export default async function ClienteAtividadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profileRaw }, { data: eventsRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", id)
      .eq("role", "client")
      .single(),
    supabase
      .from("client_events")
      .select("id, event_type, company_id, plan_id, created_at, company:companies(razao_social, nome_fantasia)")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (!profileRaw) notFound();

  const profile = profileRaw as Profile;
  const events = (eventsRaw ?? []) as unknown as EventRow[];

  return (
    <>
      <PageHeader
        title={`Atividade — ${profile.name}`}
        subtitle={profile.email ?? ""}
      >
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link href="/painel/clientes">
              <ArrowLeft />
              Voltar
            </Link>
          }
        />
      </PageHeader>

      <div className="p-6">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Este cliente ainda não acessou o portal.
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {events.map((ev) => {
              const label = EVENT_LABEL[ev.event_type] ?? ev.event_type;
              const companyName =
                ev.company?.nome_fantasia || ev.company?.razao_social || null;
              return (
                <li key={ev.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Clock className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{label}</div>
                    {companyName ? (
                      <div className="text-xs text-muted-foreground">
                        {companyName}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{formatRelativeTime(ev.created_at)}</div>
                    <div className="text-muted-foreground/60">
                      {formatDate(ev.created_at)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
