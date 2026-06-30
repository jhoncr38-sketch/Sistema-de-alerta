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
import { isCronAuthorized } from "@/lib/cron-auth";
import type { DocType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Vencidos voltam a cobrar automaticamente a cada N dias (lembrete recorrente). */
const VENCIDO_REENVIO_DIAS = 7;
const MS_PER_DAY = 86_400_000;

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
 * Em dev dá para testar pelo navegador: /api/cron/alerts?secret=<CRON_SECRET>
 * (o atalho via query é bloqueado em produção — ver lib/cron-auth.ts).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isCronAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Dry-run: roda toda a lógica mas NÃO envia e-mail nem grava notificações;
  // devolve o que SERIA enviado. Para testar com segurança: ?dryRun=1
  const dryRun = url.searchParams.get("dryRun") === "1";

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
  let resent = 0;
  let alreadySent = 0;
  const preview: Array<{
    company: string;
    kind: string;
    type: DocType;
    dueDate: string;
    action: "new" | "resend";
    recipients: number;
  }> = [];

  for (const d of docs) {
    const kind = alertKind(d.due_date, d.status);
    if (!kind) continue;

    // Parcela de parcelamento vencida vira um alerta dedicado (risco de exclusão).
    const isParcela = d.categoria === "parcelamento";
    const notifKind = isParcela && kind === "vencido" ? "parcela_risco" : kind;

    // Vencidos (boleto e parcela em risco) voltam a cobrar a cada N dias;
    // os demais alertas (7d/3d/amanhã/hoje) são enviados uma única vez.
    const isOverdue = notifKind === "vencido" || notifKind === "parcela_risco";

    // já notificado para esse documento + tipo de alerta?
    const { data: existing } = await supabase
      .from("notifications")
      .select("id,sent_at")
      .eq("document_id", d.id)
      .eq("kind", notifKind)
      .maybeSingle();
    if (existing) {
      const daysSince = existing.sent_at
        ? Math.floor(
            (Date.now() - new Date(existing.sent_at).getTime()) / MS_PER_DAY,
          )
        : Infinity;
      // Só reenvia se for vencido E já passou o intervalo de recobrança.
      if (!isOverdue || daysSince < VENCIDO_REENVIO_DIAS) {
        alreadySent++;
        continue;
      }
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
      if (!dryRun) await sendEmail({ to: recipients, subject, html });
      channel = "email";
      emailed++;
    }

    if (dryRun) {
      preview.push({
        company: companyName,
        kind: notifKind,
        type: d.type,
        dueDate: d.due_date,
        action: existing ? "resend" : "new",
        recipients: recipients.length,
      });
      if (existing) resent++;
      else processed++;
      continue;
    }

    if (existing) {
      // Recobrança do vencido: o unique(document_id, kind) impede inserir de
      // novo, então atualiza o registro existente (touch no sent_at).
      await supabase
        .from("notifications")
        .update({ channel, sent_at: new Date().toISOString() })
        .eq("id", existing.id);
      resent++;
    } else {
      await supabase
        .from("notifications")
        .insert({ document_id: d.id, channel, kind: notifKind });
      processed++;
    }
  }

  // Resumo diário para o contador (panorama de pendências de todos os clientes).
  let adminDigest: "sent" | "skipped" = "skipped";
  try {
    if (await sendAdminDigest(supabase, docs, portalBase, dryRun))
      adminDigest = "sent";
  } catch (e) {
    console.error("[cron] falha no resumo do contador:", e);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    total: docs.length,
    processed,
    emailed,
    resent,
    alreadySent,
    adminDigest,
    ...(dryRun ? { preview } : {}),
  });
}

/** Agrupa as pendências por empresa e envia o resumo diário ao(s) admin(s). */
async function sendAdminDigest(
  supabase: ReturnType<typeof createAdminClient>,
  docs: DocRow[],
  portalBase: string,
  dryRun: boolean,
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
  if (!dryRun) await sendEmail({ to: adminEmails, subject, html });
  return true;
}
