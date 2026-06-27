import { NextResponse } from "next/server";
import { alertKind, getUrgency } from "@/lib/dates";
import { sendEmail } from "@/lib/email/resend";
import {
  adminDigestEmail,
  alertEmail,
  parcelaRiscoEmail,
  type AdminDigestCompany,
} from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DocRow {
  id: string;
  type: DocType;
  categoria: "boleto" | "parcelamento";
  competencia: string | null;
  amount: number;
  due_date: string;
  status: "open" | "paid";
  company_id: string;
  parcela_num: number | null;
  company: {
    razao_social: string;
    nome_fantasia: string | null;
    email: string | null;
  } | null;
  plan: { nome: string; total: number } | null;
}

/**
 * Job diário (Vercel Cron, ver vercel.json).
 * Procura boletos abertos que vencem hoje / em 3 dias / já venceram,
 * envia e-mail ao cliente e registra a notificação (sem repetir).
 *
 * Protegido por CRON_SECRET: a Vercel envia `Authorization: Bearer <secret>`.
 * Para testar manualmente: /api/cron/alerts?secret=<CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const authorized =
    !secret ||
    request.headers.get("authorization") === `Bearer ${secret}` ||
    url.searchParams.get("secret") === secret;
  if (!authorized) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const [{ data: docsRaw, error }, { data: profilesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id,type,categoria,competencia,amount,due_date,status,company_id,parcela_num,company:companies(razao_social,nome_fantasia,email),plan:installment_plans(nome,total)",
      )
      .eq("status", "open")
      .in("categoria", ["boleto", "parcelamento"]), // guias a pagar (informativos não alertam)
    supabase
      .from("profiles")
      .select("email,company_id")
      .eq("role", "client")
      .eq("status", "approved"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mapa empresa -> e-mails dos usuários do portal
  const emailsByCompany = new Map<string, string[]>();
  for (const p of profilesRaw ?? []) {
    if (p.company_id && p.email) {
      const list = emailsByCompany.get(p.company_id) ?? [];
      list.push(p.email);
      emailsByCompany.set(p.company_id, list);
    }
  }

  const docs = (docsRaw ?? []) as unknown as DocRow[];
  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  let processed = 0;
  let emailed = 0;
  let alreadySent = 0;

  for (const d of docs) {
    const kind = alertKind(d.due_date, d.status);
    if (!kind) continue;

    // Parcela de parcelamento vencida vira um alerta dedicado (risco de exclusão).
    const isParcela = d.categoria === "parcelamento";
    const notifKind = isParcela && kind === "vencido" ? "parcela_risco" : kind;

    // já notificado para esse documento + tipo de alerta?
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("document_id", d.id)
      .eq("kind", notifKind)
      .maybeSingle();
    if (existing) {
      alreadySent++;
      continue;
    }

    const recipients = Array.from(
      new Set([
        ...(emailsByCompany.get(d.company_id) ?? []),
        ...(d.company?.email ? [d.company.email] : []),
      ]),
    );
    const companyName =
      d.company?.nome_fantasia || d.company?.razao_social || "Cliente";

    // Parcela de parcelamento: identifica pelo nº (1/33) e leva à aba certa.
    const competenciaLabel =
      isParcela && d.plan
        ? `${d.plan.nome} — parcela ${d.parcela_num}/${d.plan.total}`
        : (d.competencia ?? "");
    const portalPath = isParcela ? "/portal/parcelamentos" : "/portal/boletos";

    let channel: "email" | "portal" = "portal";
    if (recipients.length > 0) {
      const { subject, html } =
        notifKind === "parcela_risco"
          ? parcelaRiscoEmail({
              companyName,
              type: d.type,
              planNome: d.plan?.nome ?? "Parcelamento",
              parcelaNum: d.parcela_num,
              total: d.plan?.total ?? null,
              amount: Number(d.amount),
              dueDate: d.due_date,
              portalUrl: `${portalBase}/portal/parcelamentos`,
            })
          : alertEmail({
              companyName,
              type: d.type,
              competencia: competenciaLabel,
              amount: Number(d.amount),
              dueDate: d.due_date,
              kind,
              portalUrl: `${portalBase}${portalPath}`,
            });
      await sendEmail({ to: recipients, subject, html });
      channel = "email";
      emailed++;
    }

    await supabase
      .from("notifications")
      .insert({ document_id: d.id, channel, kind: notifKind });
    processed++;
  }

  // Resumo diário para o contador (panorama de pendências de todos os clientes).
  let adminDigest: "sent" | "skipped" = "skipped";
  try {
    if (await sendAdminDigest(supabase, docs, portalBase)) adminDigest = "sent";
  } catch (e) {
    console.error("[cron] falha no resumo do contador:", e);
  }

  return NextResponse.json({
    ok: true,
    total: docs.length,
    processed,
    emailed,
    alreadySent,
    adminDigest,
  });
}

/** Agrupa as pendências por empresa e envia o resumo diário ao(s) admin(s). */
async function sendAdminDigest(
  supabase: ReturnType<typeof createAdminClient>,
  docs: DocRow[],
  portalBase: string,
): Promise<boolean> {
  const byCompany = new Map<string, AdminDigestCompany>();
  for (const d of docs) {
    const { urgency } = getUrgency(d.due_date, d.status);
    if (
      urgency !== "vencido" &&
      urgency !== "vence_hoje" &&
      urgency !== "proximos_3" &&
      urgency !== "proximos_7"
    ) {
      continue;
    }
    const name = d.company?.nome_fantasia || d.company?.razao_social || "—";
    const e: AdminDigestCompany = byCompany.get(d.company_id) ?? {
      companyName: name,
      vencido: 0,
      venceHoje: 0,
      proximos: 0,
      totalAberto: 0,
    };
    if (urgency === "vencido") e.vencido++;
    else if (urgency === "vence_hoje") e.venceHoje++;
    else e.proximos++;
    e.totalAberto += Number(d.amount) || 0;
    byCompany.set(d.company_id, e);
  }

  const companies = Array.from(byCompany.values()).sort(
    (a, b) => b.vencido - a.vencido || b.venceHoje - a.venceHoje,
  );
  if (companies.length === 0) return false;

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin");
  const adminEmails = Array.from(
    new Set(
      (admins ?? [])
        .map((a) => a.email as string | null)
        .filter((e): e is string => !!e),
    ),
  );
  if (adminEmails.length === 0) return false;

  const { subject, html } = adminDigestEmail({
    companies,
    portalUrl: `${portalBase}/painel`,
  });
  await sendEmail({ to: adminEmails, subject, html });
  return true;
}
