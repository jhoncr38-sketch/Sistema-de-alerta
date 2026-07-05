import { NextResponse } from "next/server";
import { gerarResumoMensal, type ResumoDoc } from "@/lib/ai/resumo";
import { sendEmail } from "@/lib/email/resend";
import { resumoMensalEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
// Gerar vários resumos com IA pode passar do limite padrão; damos mais folga.
export const maxDuration = 60;

/**
 * Resumo mensal (Vercel Cron — ver vercel.json, dia 1 de cada mês).
 * Para cada empresa ativa, calcula os números do mês anterior, pede à IA a
 * redação (com reserva local se a IA falhar), salva em monthly_summaries e
 * envia o e-mail ao cliente. Idempotente: se já houver resumo para o mês, não
 * regera (a menos de ?force=1) — assim reexecuções não duplicam nem gastam IA.
 *
 * Protegido por CRON_SECRET (header Bearer da Vercel). Em dev, teste pelo
 * navegador: /api/cron/monthly-summary?secret=<...>&dryRun=1
 *   dryRun=1  -> calcula e mostra, sem salvar nem enviar e-mail
 *   force=1   -> regera mesmo se já existir (sobrescreve)
 *   month=YYYY-MM -> gera um mês específico (padrão: mês anterior)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isCronAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const competencia =
    url.searchParams.get("month") || competenciaMesAnterior();

  const supabase = createAdminClient();
  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  // Empresas ativas + seus documentos + e-mails dos usuários do portal.
  const [{ data: companiesRaw, error: cErr }, { data: docsRaw }, { data: profilesRaw }, { data: existingRaw }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id,razao_social,nome_fantasia,email")
        .eq("active", true),
      supabase
        .from("documents")
        .select(
          "company_id,type,categoria,amount,due_date,status,marcado_pago_at,paid_at",
        )
        .in("categoria", ["boleto", "parcelamento"]),
      supabase
        .from("profiles")
        .select("email,company_id")
        .eq("role", "client")
        .eq("status", "approved"),
      supabase
        .from("monthly_summaries")
        .select("company_id")
        .eq("competencia", competencia),
    ]);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  // Documentos agrupados por empresa.
  const docsByCompany = new Map<string, ResumoDoc[]>();
  for (const d of (docsRaw ?? []) as unknown as (ResumoDoc & { company_id: string })[]) {
    const list = docsByCompany.get(d.company_id) ?? [];
    list.push(d);
    docsByCompany.set(d.company_id, list);
  }

  // E-mails por empresa.
  const emailsByCompany = new Map<string, string[]>();
  for (const p of profilesRaw ?? []) {
    if (p.company_id && p.email) {
      const list = emailsByCompany.get(p.company_id) ?? [];
      list.push(p.email);
      emailsByCompany.set(p.company_id, list);
    }
  }

  // Empresas que já têm resumo deste mês (para pular, exceto com force).
  const jaTem = new Set(
    (existingRaw ?? []).map((r) => (r as { company_id: string }).company_id),
  );

  const companies = (companiesRaw ?? []) as {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    email: string | null;
  }[];

  let geradas = 0;
  let emailed = 0;
  let puladas = 0;
  const preview: Array<{ company: string; fonte: string; texto: string }> = [];

  for (const c of companies) {
    if (jaTem.has(c.id) && !force) {
      puladas++;
      continue;
    }

    const companyName = c.nome_fantasia || c.razao_social || "Cliente";
    const docs = docsByCompany.get(c.id) ?? [];
    const { texto, fonte } = await gerarResumoMensal(docs, competencia, companyName);

    if (dryRun) {
      preview.push({ company: companyName, fonte, texto });
      geradas++;
      continue;
    }

    // Salva/atualiza o resumo (upsert pela unique company_id+competencia).
    const { error: upErr } = await supabase.from("monthly_summaries").upsert(
      {
        company_id: c.id,
        competencia,
        texto,
        fonte,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,competencia" },
    );
    if (upErr) {
      console.error(`[cron] resumo não salvo (${companyName}):`, upErr.message);
      continue;
    }
    geradas++;

    // E-mail ao cliente (best-effort; falha de e-mail não interrompe o cron).
    const recipients = Array.from(
      new Set([
        ...(emailsByCompany.get(c.id) ?? []),
        ...(c.email ? [c.email] : []),
      ]),
    );
    if (recipients.length > 0) {
      const { subject, html } = resumoMensalEmail({
        companyName,
        competenciaLabel: competenciaExtensoLabel(competencia),
        texto,
        portalUrl: `${portalBase}/portal`,
      });
      await sendEmail({ to: recipients, subject, html });
      emailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    competencia,
    dryRun,
    force,
    companies: companies.length,
    geradas,
    emailed,
    puladas,
    ...(dryRun ? { preview } : {}),
  });
}

/** Competência "YYYY-MM" do mês anterior, no fuso do Brasil. */
function competenciaMesAnterior(today: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(today);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-06" -> "junho de 2026" (para o assunto/cabeçalho do e-mail). */
function competenciaExtensoLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1] ?? ""} de ${y}`;
}
