import { AssistenteHeaderButton } from "@/components/assistente-chat";
import { CompanyFilterSelect } from "@/components/company-filter-select";
import type { CalItem } from "@/components/obligations-calendar";
import {
  CaixaTarefas,
  ClientesAtencao,
  FiltroNumeros,
  type ClienteAtencao,
  type NumeroFiltro,
  type Tarefa,
} from "@/components/painel/dashboard-blocos";
import { ReguaVencimentos, type DiaRegua } from "@/components/painel/regua-vencimentos";
import { acessoPorEmpresa, fetchUltimosAcessos } from "@/lib/acessos";
import { getUserAndProfile } from "@/lib/auth";
import { docTypeLabel } from "@/lib/constants";
import {
  currentCompetenciaKey,
  ehDiaUtil,
  feriadoNacional,
  getUrgency,
  somarDiasUteis,
} from "@/lib/dates";
import { formatCurrency, formatUltimoAcesso } from "@/lib/format";
import { diaMesTs, guiaNome } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";

type DocPainel = DocumentRow & {
  company: { id: string; razao_social: string; nome_fantasia: string | null } | null;
  plan: { forma_pagamento: string; nome: string } | null;
};

type Filtro = "vencidos" | "semana" | "pagos" | "sem-acesso";
const FILTROS: Filtro[] = ["vencidos", "semana", "pagos", "sem-acesso"];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data/hora de agora no fuso do Brasil. */
function agoraBR() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "0";
  return { hoje: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) % 24 };
}

/** Soma `n` dias corridos a uma data YYYY-MM-DD. */
function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** "R$ 3.200" — valor sem centavos para a régua. */
const valorCurto = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/** "DAS - Simples Nacional" → "DAS"; "GPS - INSS" → "GPS". */
const tipoCurto = (d: DocumentRow) =>
  d.categoria === "parcelamento" ? "parcelas" : docTypeLabel(d.type).split(/\s[-–]\s|\s/)[0];

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; f?: string }>;
}) {
  const sp = await searchParams;
  const filtro = FILTROS.includes(sp.f as Filtro) ? (sp.f as Filtro) : null;
  const { hoje, hora } = agoraBR();
  const mesAtual = currentCompetenciaKey();

  const supabase = await createClient();
  const [
    { profile },
    { data: companiesRaw },
    { data: docsRaw },
    { data: pedidosRaw },
    { data: vinculosRaw },
    { data: perfisRaw },
    usuarios,
  ] = await Promise.all([
    getUserAndProfile(),
    supabase
      .from("companies")
      .select("id, razao_social, nome_fantasia, created_at")
      .eq("active", true),
    supabase
      .from("documents")
      .select(
        "*, company:companies(id,razao_social,nome_fantasia), plan:installment_plans(forma_pagamento,nome)",
      )
      .in("categoria", ["boleto", "parcelamento"])
      .order("due_date", { ascending: true }),
    supabase
      .from("boleto_reissue_requests")
      .select("id, requested_at, document_id")
      .eq("status", "pending"),
    supabase.from("client_companies").select("profile_id, company_id"),
    supabase.from("profiles").select("id, company_id").eq("role", "client"),
    fetchUltimosAcessos(),
  ]);

  // ----- Empresas e acesso -----
  const empresas = (companiesRaw ?? []) as {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    created_at: string;
  }[];
  const nomeEmpresa = new Map(empresas.map((c) => [c.id, c.nome_fantasia || c.razao_social]));
  const vinculos = [
    ...((vinculosRaw ?? []) as { profile_id: string; company_id: string }[]),
    ...((perfisRaw ?? []) as { id: string; company_id: string | null }[])
      .filter((p) => p.company_id)
      .map((p) => ({ profile_id: p.id, company_id: p.company_id as string })),
  ];
  const acesso = acessoPorEmpresa(vinculos, usuarios);
  const semAcesso = new Set(
    empresas
      .filter((c) => {
        const a = acesso.get(c.id);
        return !a || a.dias > 30;
      })
      .map((c) => c.id),
  );

  // ----- Filtro por empresa (vale para a tela toda) -----
  const todosDocs = (docsRaw ?? []) as DocPainel[];
  const docs = sp.company ? todosDocs.filter((d) => d.company_id === sp.company) : todosDocs;
  const empresasVisiveis = sp.company ? empresas.filter((c) => c.id === sp.company) : empresas;
  const companyOptions = empresas
    .map((c) => ({ id: c.id, label: nomeEmpresa.get(c.id) ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  // ----- Números (= filtros) -----
  const daqui7 = somarDias(hoje, 7);
  const abertos = docs.filter((d) => d.status === "open" && d.due_date);
  const vencidos = abertos.filter((d) => d.due_date! < hoje);
  const semana = abertos.filter((d) => d.due_date! >= hoje && d.due_date! <= daqui7);
  const pagosMes = docs.filter(
    (d) => d.status === "paid" && (d.paid_at ?? d.marcado_pago_at ?? "").slice(0, 7) === mesAtual,
  );
  const semAcessoVisiveis = empresasVisiveis.filter((c) => semAcesso.has(c.id));
  const soma = (l: DocPainel[]) => l.reduce((s, d) => s + (d.amount ?? 0), 0);

  const hrefFiltro = (f: Filtro | null) => {
    const p = new URLSearchParams();
    if (sp.company) p.set("company", sp.company);
    if (f) p.set("f", f);
    const qs = p.toString();
    return qs ? `/painel?${qs}` : "/painel";
  };
  const mesNome = MESES[Number(mesAtual.slice(5, 7)) - 1];
  const numeros: NumeroFiltro[] = [
    { key: "vencidos", rotulo: "Vencidos", ponto: "bg-red-600", numero: vencidos.length, valor: formatCurrency(soma(vencidos)) },
    { key: "semana", rotulo: "Vencem em 7 dias", ponto: "bg-amber-500", numero: semana.length, valor: formatCurrency(soma(semana)) },
    { key: "pagos", rotulo: `Pagos em ${mesNome}`, ponto: "bg-emerald-600", numero: pagosMes.length, valor: formatCurrency(soma(pagosMes)) },
    { key: "sem-acesso", rotulo: "Sem acessar 30+ dias", ponto: "bg-neutral-400", numero: semAcessoVisiveis.length },
  ].map((n) => ({ ...n, href: hrefFiltro(filtro === n.key ? null : (n.key as Filtro)) }));

  // ----- Tarefas: 2ª via pedida + pagamento a confirmar -----
  const porId = new Map(docs.map((d) => [d.id, d]));
  const nomeGuia = (d: DocPainel) => {
    const base = d.categoria === "parcelamento" && d.plan?.nome ? `${guiaNome(d)} · ${d.plan.nome}` : guiaNome(d);
    return d.competencia ? `${base} ${d.competencia}` : base;
  };
  const quando = (ts: string) => {
    const dia = diaMesTs(ts);
    const hojeDm = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`;
    return dia === hojeDm ? "hoje" : dia;
  };
  const todasTarefas: (Tarefa & { doc: DocPainel })[] = [];
  for (const p of (pedidosRaw ?? []) as { id: string; requested_at: string; document_id: string }[]) {
    const d = porId.get(p.document_id);
    if (!d) continue;
    todasTarefas.push({
      chave: `r-${p.id}`,
      tipo: "2via",
      id: p.id,
      docId: d.id,
      companyId: d.company_id,
      cliente: nomeEmpresa.get(d.company_id) ?? "—",
      meta: `${nomeGuia(d)} · pedida ${quando(p.requested_at)}`,
      valor: d.amount,
      prazo: somarDiasUteis(p.requested_at, 1),
      comprovanteUrl: null,
      doc: d,
    });
  }
  for (const d of docs.filter((x) => x.status === "aguardando")) {
    const enviadoEm = d.comprovante_at ?? d.marcado_pago_at ?? new Date().toISOString();
    todasTarefas.push({
      chave: `c-${d.id}`,
      tipo: "confirmar",
      id: d.id,
      docId: d.id,
      companyId: d.company_id,
      cliente: nomeEmpresa.get(d.company_id) ?? "—",
      meta: `${nomeGuia(d)} · ${d.comprovante_at ? "comprovante" : "pagamento informado"} ${quando(enviadoEm)}`,
      valor: d.amount,
      prazo: somarDiasUteis(enviadoEm, 2),
      comprovanteUrl: d.comprovante_path
        ? `/api/documents/${d.id}/download?tipo=comprovante&view=1`
        : null,
      doc: d,
    });
  }
  // Prazo (estourado → hoje → futuro) e, no empate, o maior valor primeiro.
  todasTarefas.sort((a, b) => a.prazo.localeCompare(b.prazo) || (b.valor ?? 0) - (a.valor ?? 0));
  const passaNoFiltro = (doc: DocPainel, companyId: string) => {
    if (!filtro) return true;
    if (filtro === "vencidos") return !!doc.due_date && doc.due_date < hoje;
    if (filtro === "semana") return !!doc.due_date && doc.due_date >= hoje && doc.due_date <= daqui7;
    if (filtro === "pagos") return doc.status === "paid";
    return semAcesso.has(companyId);
  };
  const tarefas = todasTarefas.filter((t) => passaNoFiltro(t.doc, t.companyId));
  const filtroInfo = filtro ? numeros.find((n) => n.key === filtro) ?? null : null;

  // ----- Régua dos próximos vencimentos -----
  const porDia = new Map<string, DocPainel[]>();
  for (const d of abertos) {
    if (d.due_date! < hoje || d.due_date! > somarDias(hoje, 30)) continue;
    const l = porDia.get(d.due_date!) ?? [];
    l.push(d);
    porDia.set(d.due_date!, l);
  }
  let picoIso: string | null = null;
  for (const [iso, l] of porDia) {
    if (!picoIso || l.length > (porDia.get(picoIso)?.length ?? 0)) picoIso = iso;
  }
  if (picoIso && (porDia.get(picoIso)?.length ?? 0) < 3) picoIso = null; // pico só se relevante
  // Começa hoje se for dia útil; no fim de semana/feriado, no próximo dia útil.
  const inicio = ehDiaUtil(hoje) ? hoje : somarDiasUteis(`${hoje}T12:00:00-03:00`, 1);
  const isos = Array.from({ length: 8 }, (_, i) => somarDias(inicio, i));
  const ultimoIso = picoIso && picoIso > isos[7] ? picoIso : somarDias(inicio, 8);
  const montarDia = (iso: string, salto: boolean): DiaRegua => {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const l = porDia.get(iso) ?? [];
    return {
      iso,
      rotulo: `${DIAS_SEMANA[dow]} ${String(d).padStart(2, "0")}`,
      guias: l.length,
      valor: l.length ? valorCurto(soma(l)) : "",
      fimDeSemana: dow === 0 || dow === 6,
      feriado: feriadoNacional(iso),
      pico: iso === picoIso,
      salto,
    };
  };
  const dias: DiaRegua[] = [...isos.map((iso) => montarDia(iso, false)), montarDia(ultimoIso, ultimoIso !== somarDias(inicio, 8))];
  let nota: string | null = null;
  if (picoIso) {
    const l = porDia.get(picoIso)!;
    const tipos = [...new Set(l.map(tipoCurto))].slice(0, 3);
    const lista = tipos.length > 1 ? `${tipos.slice(0, -1).join(", ")} e ${tipos.at(-1)}` : tipos[0];
    nota = `Dia ${picoIso.slice(8, 10)} concentra ${lista}: ${l.length} guias.`;
  }
  const calItems: CalItem[] = abertos.map((d) => ({
    id: d.id,
    dueDate: d.due_date!,
    cliente: nomeEmpresa.get(d.company_id) ?? "—",
    tipo: d.categoria === "parcelamento" && d.parcela_num ? `Parcela ${d.parcela_num}` : docTypeLabel(d.type),
    amount: d.amount,
    urgency: getUrgency(d.due_date!, d.status).urgency,
  }));

  // ----- Clientes com atenção -----
  const atencao: (ClienteAtencao & { peso: number })[] = [];
  for (const c of empresasVisiveis) {
    const deles = docs.filter((d) => d.company_id === c.id);
    const venc = deles.filter((d) => d.status === "open" && d.due_date && d.due_date < hoje);
    const atrasadasPorPlano = new Map<string, number>();
    for (const d of venc) {
      if (d.categoria === "parcelamento" && d.plan_id) {
        atrasadasPorPlano.set(d.plan_id, (atrasadasPorPlano.get(d.plan_id) ?? 0) + 1);
      }
    }
    const piorPlano = Math.max(0, ...atrasadasPorPlano.values());
    const a = acesso.get(c.id);
    const nunca = !a || !a.iso;
    const textoAcesso = nunca
      ? "Nunca acessou"
      : a.dias === 0
        ? "Acessou hoje"
        : `Último acesso ${formatUltimoAcesso(a.iso).toLowerCase()}`;
    const semanaDeles = deles.filter((d) => d.status === "open" && d.due_date && d.due_date >= hoje && d.due_date <= daqui7);
    const pagosDeles = deles.filter((d) => d.status === "paid" && (d.paid_at ?? d.marcado_pago_at ?? "").slice(0, 7) === mesAtual);

    let item: (ClienteAtencao & { peso: number }) | null = null;
    if (filtro === "semana") {
      if (semanaDeles.length)
        item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "amber", situacao: `${semanaDeles.length} ${semanaDeles.length === 1 ? "vence" : "vencem"} em 7 dias · ${formatCurrency(soma(semanaDeles))}`, extra: textoAcesso, peso: 3e9 + soma(semanaDeles) };
    } else if (filtro === "pagos") {
      if (pagosDeles.length)
        item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "muted", situacao: `${pagosDeles.length} ${pagosDeles.length === 1 ? "pago" : "pagos"} em ${mesNome} · ${formatCurrency(soma(pagosDeles))}`, extra: null, peso: soma(pagosDeles) };
    } else if (venc.length && filtro !== "sem-acesso") {
      item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "red", situacao: `${venc.length} ${venc.length === 1 ? "vencido" : "vencidos"} · ${formatCurrency(soma(venc))}`, extra: piorPlano >= 2 ? `${piorPlano} parcelas atrasadas` : textoAcesso, peso: 4e9 + soma(venc) };
    } else if (piorPlano >= 2 && !filtro) {
      item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "orange", situacao: "Parcelamento em risco", extra: `${piorPlano} parcelas atrasadas`, peso: 3e9 };
    } else if (nunca && (!filtro || filtro === "sem-acesso")) {
      item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "muted", situacao: "Nunca acessou o portal", extra: `Cliente desde ${c.created_at.slice(5, 7)}/${c.created_at.slice(0, 4)}`, peso: 2e9 };
    } else if (a && a.dias > 30 && (!filtro || filtro === "sem-acesso")) {
      item = { id: c.id, nome: nomeEmpresa.get(c.id)!, tom: "amber", situacao: `Sem acessar há ${a.dias} dias`, extra: null, peso: 1e9 + a.dias };
    }
    if (item) atencao.push(item);
  }
  atencao.sort((x, y) => y.peso - x.peso);

  // ----- Cabeçalho -----
  const primeiroNome = (profile?.name ?? "").split(/\s+/)[0];
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const [ay, am, ad] = hoje.split("-").map(Number);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(ay, am - 1, ad));
  const subtitulo = `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)}, ${ad} de ${MESES[am - 1]} · ${empresas.length} ${empresas.length === 1 ? "cliente ativo" : "clientes ativos"}`;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {saudacao}
            {primeiroNome ? `, ${primeiroNome}` : ""}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AssistenteHeaderButton scope="contador" />
          {companyOptions.length >= 2 ? (
            <CompanyFilterSelect
              options={companyOptions}
              value={sp.company ?? ""}
              allLabel="Todas as empresas"
            />
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3.5 px-4 py-4 sm:px-6">
        <FiltroNumeros itens={numeros} ativo={filtro} />
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <CaixaTarefas
              tarefas={tarefas}
              hoje={hoje}
              filtro={filtroInfo ? { rotulo: filtroInfo.rotulo, ponto: filtroInfo.ponto } : null}
              foraDoFiltro={todasTarefas.length - tarefas.length}
              limparHref={hrefFiltro(null)}
            />
            <ReguaVencimentos dias={dias} nota={nota} calItems={calItems} />
          </div>
          <ClientesAtencao clientes={atencao.slice(0, 6)} />
        </div>
      </div>
    </>
  );
}
