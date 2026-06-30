import { Activity, Building2, ShieldCheck, ShieldOff, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { ClientActionsMenu } from "@/components/client-actions-menu";
import { CnpjInput } from "@/components/masked-inputs";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { EditClientButton } from "@/components/edit-client-button";
import { EditCompanyButton } from "@/components/edit-company-button";
import { NewCompanyButton } from "@/components/new-company-button";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/format";
import type { Company, Profile, ProfileWithCompany } from "@/lib/types";
import {
  approveClient,
  deleteClient,
  deleteCompany,
  demoteToClient,
  promoteToAdmin,
  rejectClient,
} from "./actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function ClientesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [
    { data: clientsRaw },
    { data: companiesRaw },
    { data: linksRaw },
    { data: adminsRaw },
    { data: eventsRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      // Desambigua: profiles tem 2 caminhos até companies (FK direta + N-para-N).
      .select("*, company:companies!profiles_company_id_fkey(*)")
      .eq("role", "client")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("*").order("razao_social"),
    supabase.from("client_companies").select("profile_id, company_id"),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "admin")
      .order("created_at", { ascending: true }),
    supabase
      .from("client_events")
      .select("client_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const clients = (clientsRaw ?? []) as ProfileWithCompany[];
  const admins = (adminsRaw ?? []) as Profile[];
  const companies = (companiesRaw ?? []) as Company[];
  const links = (linksRaw ?? []) as { profile_id: string; company_id: string }[];

  // Último acesso de cada cliente: first occurrence por client_id (já ordenado desc).
  const lastAccessByClient = new Map<string, string>();
  for (const ev of (eventsRaw ?? []) as { client_id: string; created_at: string }[]) {
    if (!lastAccessByClient.has(ev.client_id)) {
      lastAccessByClient.set(ev.client_id, ev.created_at);
    }
  }
  const pending = clients.filter((c) => c.status === "pending");
  const approved = clients.filter((c) => c.status === "approved");

  const companyById = new Map(companies.map((co) => [co.id, co]));

  // Vínculos N-para-N (definidos pelo contador): empresas por cliente e vice-versa.
  const companyIdsByClient = new Map<string, string[]>();
  const clientsByCompany = new Map<string, ProfileWithCompany[]>();
  const clientById = new Map(approved.map((c) => [c.id, c]));
  for (const l of links) {
    const ids = companyIdsByClient.get(l.profile_id) ?? [];
    ids.push(l.company_id);
    companyIdsByClient.set(l.profile_id, ids);

    const client = clientById.get(l.profile_id);
    if (client) {
      const arr = clientsByCompany.get(l.company_id) ?? [];
      arr.push(client);
      clientsByCompany.set(l.company_id, arr);
    }
  }

  // Empresas (objetos) que cada cliente pode ver, para exibir na lista.
  const companiesByClient = new Map<string, Company[]>();
  for (const [pid, ids] of companyIdsByClient) {
    companiesByClient.set(
      pid,
      ids
        .map((id) => companyById.get(id))
        .filter((c): c is Company => !!c),
    );
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Aprove cadastros, edite empresas e escolha quais empresas cada cliente pode ver"
      >
        <NewCompanyButton />
      </PageHeader>
      <div className="space-y-8 p-6">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserCheck className="size-4" /> Cadastros pendentes
            {pending.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pending.length}
              </span>
            ) : null}
          </h2>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhum cadastro aguardando aprovação.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.map((c) => (
                <Card key={c.id} className="gap-4">
                  <div className="px-4">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {c.email ?? "—"}
                    </div>
                  </div>

                  <form action={approveClient} className="space-y-3 px-4">
                    <input type="hidden" name="userId" value={c.id} />

                    <div className="space-y-1.5">
                      <Label htmlFor={`company-${c.id}`}>Vincular à empresa</Label>
                      <select
                        id={`company-${c.id}`}
                        name="companyId"
                        className={selectClass}
                        defaultValue=""
                      >
                        <option value="">— Criar nova empresa —</option>
                        {companies.map((co) => (
                          <option key={co.id} value={co.id}>
                            {co.nome_fantasia || co.razao_social} ({co.cnpj})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`razao-${c.id}`} className="text-xs">
                          Razão social (nova)
                        </Label>
                        <Input
                          id={`razao-${c.id}`}
                          name="razao_social"
                          placeholder="Empresa X Ltda"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cnpj-${c.id}`} className="text-xs">
                          CNPJ (novo)
                        </Label>
                        <CnpjInput id={`cnpj-${c.id}`} name="cnpj" />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button type="submit" size="sm">
                        Aprovar e vincular
                      </Button>
                    </div>
                  </form>

                  <form action={rejectClient} className="border-t px-4 pt-3">
                    <input type="hidden" name="userId" value={c.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Recusar
                    </Button>
                  </form>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4" /> Empresas
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Empresa</th>
                  <th className="px-4 py-2.5 font-medium">CNPJ</th>
                  <th className="px-4 py-2.5 font-medium">Contato</th>
                  <th className="px-4 py-2.5 font-medium">Clientes com acesso</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Nenhuma empresa cadastrada. Use “Cadastrar empresa” para
                      adicionar a primeira.
                    </td>
                  </tr>
                ) : (
                  companies.map((co) => {
                    const nome = co.nome_fantasia || co.razao_social;
                    const vinculados = clientsByCompany.get(co.id) ?? [];
                    return (
                      <tr key={co.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{nome}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {co.cnpj}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {co.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {vinculados.length > 0 ? (
                            vinculados.map((v) => v.name).join(", ")
                          ) : (
                            <span className="text-muted-foreground/60">
                              Sem acesso ainda
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <EditCompanyButton company={co} />
                            <ConfirmDeleteButton
                              action={deleteCompany.bind(null, co.id)}
                              title="Apagar empresa?"
                              confirmLabel="Apagar empresa"
                              successMessage="Empresa apagada do sistema."
                              description={
                                <>
                                  A empresa <strong>{nome}</strong>
                                  {co.cnpj ? ` (${co.cnpj})` : ""} será removida
                                  com todos os boletos, documentos, histórico de
                                  faturamento e o acesso dos clientes vinculados.
                                  Esta ação não pode ser desfeita.
                                </>
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4" /> Clientes ativos
          </h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">E-mail</th>
                  <th className="px-4 py-2.5 font-medium">Empresas que pode ver</th>
                  <th className="px-4 py-2.5 font-medium">Último acesso</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {approved.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Nenhum cliente ativo ainda.
                    </td>
                  </tr>
                ) : (
                  approved.map((c) => {
                    const cos = companiesByClient.get(c.id) ?? [];
                    const linkedIds = companyIdsByClient.get(c.id) ?? [];
                    const lastAccess = lastAccessByClient.get(c.id);
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.email ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {cos.length === 0 ? (
                            <span className="text-muted-foreground/60">
                              Nenhuma empresa
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {cos.map((co) => (
                                <span
                                  key={co.id}
                                  className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-border"
                                >
                                  {co.nome_fantasia || co.razao_social}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {lastAccess ? (
                            <a
                              href={`/painel/clientes/${c.id}/atividade`}
                              className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
                            >
                              <Activity className="size-3.5 shrink-0 text-muted-foreground" />
                              {formatRelativeTime(lastAccess)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground/60">Nunca acessou</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1">
                            <EditClientButton
                              client={c}
                              companies={companies}
                              linkedIds={linkedIds}
                            />
                            <ConfirmDeleteButton
                              action={deleteClient.bind(null, c.id)}
                              title="Apagar cliente?"
                              confirmLabel="Apagar cliente"
                              successMessage="Cliente apagado do sistema."
                              description={
                                <>
                                  O cadastro de <strong>{c.name}</strong>
                                  {c.email ? ` (${c.email})` : ""} será removido,
                                  junto com o login de acesso e os vínculos com
                                  as empresas. As empresas e seus documentos
                                  permanecem no sistema. Esta ação não pode ser
                                  desfeita.
                                </>
                              }
                            />
                            <ClientActionsMenu
                              clientName={c.name}
                              promoteAction={promoteToAdmin.bind(null, c.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4" /> Contadores (acesso ao painel)
          </h2>
          <p className="text-sm text-muted-foreground">
            Quem está aqui enxerga o painel completo — todos os clientes,
            empresas e documentos do escritório. Para dar acesso a alguém, use
            “Tornar contador” na lista de clientes ativos.
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">E-mail</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const isMe = a.id === user?.id;
                  return (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {a.name}
                        {isMe ? (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            você
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.email ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {isMe ? null : (
                            <ConfirmActionButton
                              action={demoteToClient.bind(null, a.id)}
                              icon={<ShieldOff />}
                              triggerLabel="Remover acesso"
                              triggerVariant="ghost"
                              confirmVariant="destructive"
                              confirmLabel="Remover acesso"
                              successMessage="Acesso de contador removido."
                              title="Remover acesso de contador?"
                              description={
                                <>
                                  <strong>{a.name}</strong> deixará de ver o
                                  painel do contador e voltará a ser um cliente
                                  comum. As empresas e documentos não são
                                  afetados. Você pode promover de novo quando
                                  quiser.
                                </>
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
