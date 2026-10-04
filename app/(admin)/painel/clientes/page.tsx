import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { AssistenteHeaderButton } from "@/components/assistente-chat";
import { ClientActionsMenu } from "@/components/client-actions-menu";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { ConvidarAcessoButton } from "@/components/convidar-acesso-button";
import { EditClientButton } from "@/components/edit-client-button";
import { NewClientButton } from "@/components/new-client-button";
import { NewCompanyButton } from "@/components/new-company-button";
import type { CalItem } from "@/components/obligations-calendar";
import { BotaoCalendario } from "@/components/painel/botao-calendario";
import { CaixaTarefas } from "@/components/painel/caixa-tarefas";
import {
  CadastrosPendentes,
  type CadastroPendente,
} from "@/components/painel/clientes/cadastros-pendentes";
import {
  PainelEmpresa,
  type Contato,
  type GuiaAberta,
  type PessoaAcesso,
  type Tom,
} from "@/components/painel/clientes/painel-empresa";
import {
  TabelaEmpresas,
  type FiltroEmpresas,
  type LinhaEmpresa,
} from "@/components/painel/clientes/tabela-empresas";
import type { EstadoMes } from "@/components/portal/mapa-ano";
import { acessoPorEmpresa, fetchUltimosAcessos } from "@/lib/acessos";
import { AI_DEFAULT_LIMIT } from "@/lib/ai/usage";
import { docTypeLabel } from "@/lib/constants";
import { currentCompetenciaKey, getUrgency, hojeBR } from "@/lib/dates";
import { formatDayMonth, formatUltimoAcesso } from "@/lib/format";
import { guiaNome } from "@/lib/portal";
import { sugerirEmpresa } from "@/lib/sugestao-empresa";
import { createClient } from "@/lib/supabase/server";
import { carregarTarefas } from "@/lib/tarefas";
import type { Company, DocumentRow, Profile, ProfileWithCompany } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  convidarAcesso,
  deleteClient,
  demoteToClient,
  promoteToAdmin,
  setClientActive,
} from "./actions";

type Aba = "empresas" | "pessoas" | "contadores";

type DocGuia = Pick<
  DocumentRow,
  | "id"
  | "company_id"
  | "status"
  | "due_date"
  | "amount"
  | "categoria"
  | "type"
  | "descricao"
  | "parcela_num"
  | "competencia"
>;

type DocRotulo = Pick<DocumentRow, "categoria" | "type" | "descricao" | "parcela_num" | "competencia">;

const KIND_LABEL: Record<string, string> = {
  vencido: "vencido",
  vence_hoje: "vence hoje",
  dias_1: "vence amanhã",
  dias_3: "faltam 3 dias",
  dias_7: "faltam 7 dias",
};

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "DAS - Simples Nacional 09/2026". */
const rotuloGuia = (d: DocRotulo | null) =>
  d ? `${guiaNome(d)}${d.competencia ? ` ${d.competencia}` : ""}` : "documento removido";

/** "Há 3 dias" → "há 3 dias"; nunca → "nunca". */
const acessoMinusculo = (iso: string | null) => {
  if (!iso) return "nunca";
  const t = formatUltimoAcesso(iso);
  return t.charAt(0).toLowerCase() + t.slice(1);
};

/** "hoje 09:12", "ontem", "28/09" — horário de Brasília. */
function quandoCurto(iso: string, hoje: string): string {
  const dia = hojeBR(new Date(iso));
  if (dia === hoje) {
    const hora = new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `hoje ${hora}`;
  }
  const [y, m, d] = hoje.split("-").map(Number);
  const ontem = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (dia === ontem) return "ontem";
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; f?: string; empresa?: string }>;
}) {
  const sp = await searchParams;
  const aba: Aba = sp.aba === "pessoas" || sp.aba === "contadores" ? sp.aba : "empresas";
  const filtroInicial: FiltroEmpresas | null =
    sp.f === "vencidos" || sp.f === "sem-acesso" || sp.f === "nunca" ? sp.f : null;
  const hoje = hojeBR();
  const ano = Number(hoje.slice(0, 4));

  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: clientsRaw },
    { data: companiesRaw },
    { data: linksRaw },
    { data: adminsRaw },
    { data: abertosRaw },
    usuarios,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      // Desambigua: profiles tem 2 caminhos até companies (FK direta + N-para-N).
      .select("*, company:companies!profiles_company_id_fkey(*)")
      .eq("role", "client")
      .order("created_at", { ascending: false }),
    supabase.from("companies").select("*").order("razao_social"),
    supabase.from("client_companies").select("profile_id, company_id"),
    supabase.from("profiles").select("*").eq("role", "admin").order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id, company_id, status, due_date, amount, categoria, type, parcela_num")
      .in("categoria", ["boleto", "parcelamento"])
      .in("status", ["open", "aguardando"]),
    fetchUltimosAcessos(),
  ]);

  const clients = (clientsRaw ?? []) as ProfileWithCompany[];
  const admins = (adminsRaw ?? []) as Profile[];
  const companies = (companiesRaw ?? []) as Company[];
  const links = (linksRaw ?? []) as { profile_id: string; company_id: string }[];
  const abertos = (abertosRaw ?? []) as Pick<
    DocumentRow,
    "id" | "company_id" | "status" | "due_date" | "amount" | "categoria" | "type" | "parcela_num"
  >[];
  const pending = clients.filter((c) => c.status === "pending");
  const approved = clients.filter((c) => c.status === "approved");

  const companyById = new Map(companies.map((co) => [co.id, co]));
  const nomeDe = (co: Company) => co.nome_fantasia || co.razao_social;

  // Vínculos N-para-N (client_companies) + a empresa principal do perfil.
  const vinculos = [
    ...links,
    ...approved
      .filter((c) => c.company_id && !links.some((l) => l.profile_id === c.id && l.company_id === c.company_id))
      .map((c) => ({ profile_id: c.id, company_id: c.company_id as string })),
  ];
  const companyIdsByClient = new Map<string, string[]>();
  const pessoasPorEmpresa = new Map<string, ProfileWithCompany[]>();
  const clientById = new Map(approved.map((c) => [c.id, c]));
  for (const l of vinculos) {
    const ids = companyIdsByClient.get(l.profile_id) ?? [];
    if (!ids.includes(l.company_id)) ids.push(l.company_id);
    companyIdsByClient.set(l.profile_id, ids);
    const client = clientById.get(l.profile_id);
    if (client) {
      const arr = pessoasPorEmpresa.get(l.company_id) ?? [];
      if (!arr.includes(client)) arr.push(client);
      pessoasPorEmpresa.set(l.company_id, arr);
    }
  }
  const acesso = acessoPorEmpresa(vinculos, usuarios);

  // ----- Linhas da tabela de empresas -----
  const linhas: LinhaEmpresa[] = companies.map((co) => {
    const deles = abertos.filter((d) => d.company_id === co.id);
    const vencidos = deles.filter((d) => d.status === "open" && d.due_date && d.due_date < hoje).length;
    const a = acesso.get(co.id);
    const iso = a?.iso ?? null;
    const pessoas = pessoasPorEmpresa.get(co.id) ?? [];
    return {
      id: co.id,
      nome: nomeDe(co),
      cnpj: co.cnpj,
      email: co.email,
      telefone: co.phone,
      vencidos,
      emAberto: deles.reduce((s, d) => s + (d.amount ?? 0), 0),
      acessoTexto: acessoMinusculo(iso),
      acessoIso: iso,
      semAcesso30: !!iso && (a?.dias ?? 0) > 30,
      nunca: !iso,
      inativa: co.active === false,
      busca: semAcento(
        [co.razao_social, co.nome_fantasia, co.cnpj, co.email, ...pessoas.flatMap((p) => [p.name, p.email])]
          .filter(Boolean)
          .join(" "),
      ),
    };
  });
  // Quem tem vencido primeiro (mais vencidos, maior valor); depois por nome.
  linhas.sort(
    (x, y) =>
      Number(y.vencidos > 0) - Number(x.vencidos > 0) ||
      y.vencidos - x.vencidos ||
      y.emAberto - x.emAberto ||
      x.nome.localeCompare(y.nome, "pt-BR"),
  );

  // ----- Cadastros pendentes (com sugestão pelo e-mail) -----
  const pendentes: CadastroPendente[] = pending.map((p) => {
    const s = sugerirEmpresa(p.email, companies);
    return { id: p.id, name: p.name, email: p.email, sugestao: s ? { id: s.id, nome: nomeDe(s) } : null };
  });
  const empresasOpcoes = companies
    .map((co) => ({ id: co.id, label: nomeDe(co), cnpj: co.cnpj }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  // ----- Painel lateral (?empresa=id) -----
  const sel = sp.empresa ? (companyById.get(sp.empresa) ?? null) : null;
  const semEmpresa = new URLSearchParams();
  if (aba !== "empresas") semEmpresa.set("aba", aba);
  if (filtroInicial) semEmpresa.set("f", filtroInicial);
  const fecharHref = semEmpresa.toString() ? `/painel/clientes?${semEmpresa}` : "/painel/clientes";
  const nomes = new Map(companies.map((co) => [co.id, nomeDe(co)]));
  const [painel, tarefas] = await Promise.all([
    sel ? dadosDoPainel(sel) : null,
    carregarTarefas(supabase, nomes),
  ]);

  // Calendário de vencimentos (botão no cabeçalho): todas as guias em aberto.
  const calItems: CalItem[] = abertos
    .filter((d) => d.status === "open" && d.due_date)
    .map((d) => ({
      id: d.id,
      dueDate: d.due_date!,
      cliente: nomes.get(d.company_id) ?? "—",
      tipo: d.categoria === "parcelamento" && d.parcela_num ? `Parcela ${d.parcela_num}` : docTypeLabel(d.type),
      amount: d.amount,
      urgency: getUrgency(d.due_date!, d.status).urgency,
    }));

  // Saudação (esta é a tela inicial do painel).
  const horaBR = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()),
  ) % 24;
  const saudacao = horaBR < 12 ? "Bom dia" : horaBR < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (admins.find((a) => a.id === user?.id)?.name ?? "").split(/\s+/)[0];
  const [hy, hm, hd] = hoje.split("-").map(Number);
  const dataExtenso = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(hy, hm - 1, hd),
  );

  async function dadosDoPainel(co: Company) {
    const id = co.id;
    const [
      { data: docsRaw },
      { data: publicadosRaw },
      { data: pagosRaw },
      { data: pedidosRaw },
      { data: alertasRaw },
      { data: avisosRaw },
      { data: usoRaw },
    ] = await Promise.all([
      supabase
        .from("documents")
        .select("id, company_id, status, due_date, amount, categoria, type, descricao, parcela_num, competencia")
        .eq("company_id", id)
        .in("categoria", ["boleto", "parcelamento"])
        .or(`due_date.gte.${ano}-01-01,status.in.(open,aguardando)`),
      supabase
        .from("documents")
        .select("id, created_at, categoria, type, descricao, parcela_num, competencia")
        .eq("company_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("documents")
        .select("id, marcado_pago_at, comprovante_at, categoria, type, descricao, parcela_num, competencia")
        .eq("company_id", id)
        .not("marcado_pago_at", "is", null)
        .order("marcado_pago_at", { ascending: false })
        .limit(5),
      supabase
        .from("boleto_reissue_requests")
        .select("id, status, requested_at, resolved_at, resolved_by, document_id, document:documents(categoria, type, descricao, parcela_num, competencia)")
        .eq("company_id", id)
        .order("requested_at", { ascending: false })
        .limit(5),
      supabase
        .from("notifications")
        .select("id, channel, kind, sent_at, document:documents!inner(company_id, categoria, type, descricao, parcela_num, competencia)")
        .eq("document.company_id", id)
        .order("sent_at", { ascending: false })
        .limit(5),
      supabase
        .from("avisos")
        .select("id, title, created_at")
        .eq("company_id", id)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("ai_usage")
        .select("count")
        .eq("company_id", id)
        .eq("month", currentCompetenciaKey())
        .maybeSingle(),
    ]);

    const docs = (docsRaw ?? []) as DocGuia[];
    const pedidos = (pedidosRaw ?? []) as unknown as {
      id: string;
      status: string;
      requested_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
      document_id: string;
      document: DocRotulo | null;
    }[];
    const pedidoPendente = new Set(pedidos.filter((p) => p.status === "pending").map((p) => p.document_id));

    // Mapa do ano (só boletos, por vencimento), como no portal do cliente.
    const mesAtual = hoje.slice(0, 7);
    const mapa: EstadoMes[] = Array.from({ length: 12 }, (_, i) => {
      const key = `${ano}-${String(i + 1).padStart(2, "0")}`;
      if (key > mesAtual) return "vazio";
      const doMes = docs.filter((d) => d.categoria === "boleto" && d.due_date?.startsWith(key));
      if (doMes.some((d) => d.status === "open" && d.due_date! < hoje)) return "pendente";
      if (key === mesAtual) return "corrente";
      if (doMes.length > 0 && doMes.every((d) => d.status === "paid")) return "pago";
      return doMes.length > 0 ? "corrente" : "vazio";
    });

    // Em aberto: atrasadas e pedidos primeiro, depois a confirmar, depois por vencimento.
    const emAberto = docs.filter((d) => d.status === "open" || d.status === "aguardando");
    const guiasTodas: (GuiaAberta & { ordem: number; due: string })[] = emAberto.map((d) => {
      const venc = d.due_date ? formatDayMonth(d.due_date) : null;
      let situacao = venc ? `vence ${venc}` : "sem vencimento";
      let tom: Tom = "blue";
      let ordem = 3;
      if (d.status === "aguardando") {
        situacao = "confirmar pagamento";
        tom = "amber";
        ordem = 2;
      } else if (pedidoPendente.has(d.id)) {
        situacao = "2ª via pedida";
        tom = "red";
        ordem = 1;
      } else if (d.due_date && d.due_date < hoje) {
        situacao = `venceu ${venc}`;
        tom = "red";
        ordem = 1;
      }
      return { id: d.id, nome: rotuloGuia(d), situacao, tom, valor: d.amount, ordem, due: d.due_date ?? "9999" };
    });
    guiasTodas.sort((a, b) => a.ordem - b.ordem || a.due.localeCompare(b.due));

    // Últimos contatos: lembretes, pedidos de 2ª via, pagamentos, publicações e comunicados.
    const contatos: Contato[] = [];
    for (const n of (alertasRaw ?? []) as unknown as {
      id: string;
      channel: string;
      kind: string;
      sent_at: string;
      document: DocRotulo | null;
    }[]) {
      contatos.push({
        chave: `n-${n.id}`,
        tom: "blue",
        texto: n.channel === "email" ? "Lembrete automático por e-mail" : "Lembrete no portal",
        detalhe: `${rotuloGuia(n.document)}${KIND_LABEL[n.kind] ? ` (${KIND_LABEL[n.kind]})` : ""}`,
        quando: quandoCurto(n.sent_at, hoje),
        em: n.sent_at,
      });
    }
    for (const p of pedidos) {
      contatos.push({
        chave: `r-${p.id}`,
        tom: "red",
        texto: "Cliente pediu 2ª via",
        detalhe: rotuloGuia(p.document),
        quando: quandoCurto(p.requested_at, hoje),
        em: p.requested_at,
      });
      if ((p.status === "resolved" || p.status === "rejected") && p.resolved_at) {
        contatos.push({
          chave: `rr-${p.id}`,
          tom: "muted",
          texto:
            p.status === "rejected"
              ? "Você recusou o pedido de 2ª via"
              : p.resolved_by
                ? "2ª via resolvida pelo escritório"
                : "Cliente gerou a 2ª via na Receita",
          detalhe: rotuloGuia(p.document),
          quando: quandoCurto(p.resolved_at, hoje),
          em: p.resolved_at,
        });
      }
    }
    for (const d of (pagosRaw ?? []) as (DocRotulo & {
      id: string;
      marcado_pago_at: string;
      comprovante_at: string | null;
    })[]) {
      const em = d.comprovante_at ?? d.marcado_pago_at;
      contatos.push({
        chave: `p-${d.id}`,
        tom: "amber",
        texto: d.comprovante_at ? "Cliente enviou comprovante" : "Cliente informou pagamento",
        detalhe: rotuloGuia(d),
        quando: quandoCurto(em, hoje),
        em,
      });
    }
    for (const d of (publicadosRaw ?? []) as (DocRotulo & { id: string; created_at: string })[]) {
      contatos.push({
        chave: `d-${d.id}`,
        tom: "muted",
        texto: "Publicado no portal",
        detalhe: rotuloGuia(d),
        quando: quandoCurto(d.created_at, hoje),
        em: d.created_at,
      });
    }
    for (const a of (avisosRaw ?? []) as { id: string; title: string; created_at: string }[]) {
      contatos.push({
        chave: `a-${a.id}`,
        tom: "blue",
        texto: "Comunicado",
        detalhe: a.title,
        quando: quandoCurto(a.created_at, hoje),
        em: a.created_at,
      });
    }
    contatos.sort((x, y) => y.em.localeCompare(x.em));

    const pessoas: PessoaAcesso[] = (pessoasPorEmpresa.get(id) ?? []).map((p) => {
      const u = usuarios.get(p.id);
      return {
        id: p.id,
        nome: p.name,
        email: p.email,
        acessoTexto: u?.iso ? `acessou ${acessoMinusculo(u.iso)}` : "nunca acessou",
        alerta: u?.sumido ?? true,
        convidar: (u?.sumido ?? true) && p.active !== false && (!!p.email || !!co.phone),
      };
    });

    const [cy, cm] = co.created_at.slice(0, 7).split("-");
    return {
      clienteDesde: `${cm}/${cy}`,
      mapa,
      guias: guiasTodas.slice(0, 3),
      totalAberto: emAberto.reduce((s, d) => s + (d.amount ?? 0), 0),
      qtdAberto: emAberto.length,
      contatos: contatos.slice(0, 5),
      pessoas,
      usoIa: (usoRaw as { count: number } | null)?.count ?? 0,
      limiteIa: co.ai_monthly_limit ?? AI_DEFAULT_LIMIT,
    };
  }

  const abaHref = (a: Aba) => (a === "empresas" ? "/painel/clientes" : `/painel/clientes?aba=${a}`);
  const ABAS: { key: Aba; rotulo: string; n: number }[] = [
    { key: "empresas", rotulo: "Empresas", n: companies.length },
    { key: "pessoas", rotulo: "Pessoas", n: approved.length },
    { key: "contadores", rotulo: "Contadores", n: admins.length },
  ];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Clientes</h1>
          <p className="truncate text-xs text-muted-foreground first-letter:uppercase">
            {saudacao}
            {primeiroNome ? `, ${primeiroNome}` : ""} · {dataExtenso}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssistenteHeaderButton scope="contador" />
          <BotaoCalendario itens={calItems} />
          {companies.length > 0 ? <NewClientButton companies={empresasOpcoes} /> : null}
          <NewCompanyButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
          {tarefas.length > 0 ? <CaixaTarefas tarefas={tarefas} hoje={hoje} /> : null}
          <CadastrosPendentes pendentes={pendentes} empresas={empresasOpcoes} />

          <nav className="inline-flex self-start rounded-lg bg-muted p-[3px]" aria-label="Ver">
            {ABAS.map((a) => (
              <Link
                key={a.key}
                href={abaHref(a.key)}
                scroll={false}
                aria-current={aba === a.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px]",
                  aba === a.key
                    ? "bg-card font-semibold shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {a.rotulo}
                <span className="font-medium text-muted-foreground">{a.n}</span>
              </Link>
            ))}
          </nav>

          {aba === "empresas" ? (
            <TabelaEmpresas linhas={linhas} selecionada={sel?.id ?? null} filtroInicial={filtroInicial} />
          ) : aba === "pessoas" ? (
            <section className="overflow-hidden rounded-[10px] border bg-card">
              <div className="hidden h-8 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_112px] items-center gap-3 px-3.5 text-xs text-neutral-400 md:grid">
                <span>Nome</span>
                <span>Empresas que pode ver</span>
                <span>Último acesso</span>
                <span />
              </div>
              {approved.length === 0 ? (
                <p className="border-t px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Nenhum cliente ativo ainda.
                </p>
              ) : (
                approved.map((c) => {
                  const ids = companyIdsByClient.get(c.id) ?? [];
                  const cos = ids.map((i) => companyById.get(i)).filter((x): x is Company => !!x);
                  const inativo = c.active === false;
                  const u = usuarios.get(c.id);
                  const sumido = u?.sumido ?? true;
                  // WhatsApp usa o telefone da empresa (não há por pessoa).
                  const hasPhone = cos.some((co) => !!co.phone);
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex flex-col gap-1.5 border-t px-3.5 py-2.5 md:grid md:min-h-[50px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_112px] md:items-center md:gap-3 md:py-1.5",
                        inativo && "bg-muted/30",
                      )}
                    >
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-semibold", inativo && "text-muted-foreground")}>
                          {c.name}
                          {inativo ? (
                            <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                              Desativado
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.email ?? "—"}</span>
                      </span>
                      <span className="flex min-w-0 flex-wrap gap-1">
                        {cos.length === 0 ? (
                          <span className="text-[13px] text-muted-foreground/60">Nenhuma empresa</span>
                        ) : (
                          cos.map((co) => (
                            <Link
                              key={co.id}
                              href={`/painel/clientes?empresa=${co.id}`}
                              className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-xs font-medium hover:bg-muted/70"
                            >
                              {nomeDe(co)}
                            </Link>
                          ))
                        )}
                      </span>
                      <span className="flex flex-col items-start gap-1">
                        <span
                          className={cn(
                            "text-[13px]",
                            sumido ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                          )}
                          title={u?.iso ? new Date(u.iso).toLocaleString("pt-BR") : "Nunca fez login no portal"}
                        >
                          {u?.iso ? acessoMinusculo(u.iso) : "nunca"}
                        </span>
                        {sumido && !inativo && (c.email || hasPhone) ? (
                          <ConvidarAcessoButton
                            action={convidarAcesso.bind(null, c.id)}
                            hasEmail={!!c.email}
                            hasPhone={hasPhone}
                          />
                        ) : null}
                      </span>
                      <span className="flex justify-end gap-1">
                        <EditClientButton client={c} companies={companies} linkedIds={ids} />
                        <ConfirmDeleteButton
                          action={deleteClient.bind(null, c.id)}
                          title="Apagar cliente?"
                          confirmLabel="Apagar cliente"
                          successMessage="Cliente apagado do sistema."
                          description={
                            <>
                              O cadastro de <strong>{c.name}</strong>
                              {c.email ? ` (${c.email})` : ""} será removido, junto com o login de
                              acesso e os vínculos com as empresas. As empresas e seus documentos
                              permanecem no sistema. Esta ação não pode ser desfeita.
                            </>
                          }
                        />
                        <ClientActionsMenu
                          clientName={c.name}
                          active={c.active !== false}
                          hasEmail={!!c.email}
                          hasPhone={hasPhone}
                          toggleActiveAction={setClientActive.bind(null, c.id, c.active === false)}
                          promoteAction={promoteToAdmin.bind(null, c.id)}
                          convidarAction={convidarAcesso.bind(null, c.id)}
                        />
                      </span>
                    </div>
                  );
                })
              )}
            </section>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">
                Quem está aqui enxerga o painel completo — todos os clientes, empresas e documentos do
                escritório. Para dar acesso a alguém, use “Tornar contador” na aba Pessoas.
              </p>
              <section className="overflow-hidden rounded-[10px] border bg-card">
                {admins.map((a) => {
                  const isMe = a.id === user?.id;
                  return (
                    <div key={a.id} className="flex min-h-[50px] items-center gap-3 border-t px-3.5 py-1.5 first:border-t-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {a.name}
                          {isMe ? (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              você
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{a.email ?? "—"}</span>
                      </span>
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
                              <strong>{a.name}</strong> deixará de ver o painel do contador e voltará a
                              ser um cliente comum. As empresas e documentos não são afetados. Você pode
                              promover de novo quando quiser.
                            </>
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>

        {sel && painel ? (
          <PainelEmpresa
            empresa={sel}
            fecharHref={fecharHref}
            ano={ano}
            telefoneEmpresa={!!sel.phone}
            empresasOpcoes={empresasOpcoes}
            {...painel}
          />
        ) : null}
      </div>
    </>
  );
}
