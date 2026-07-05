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
import { sendPushToSubscriptions, type PushSub } from "@/lib/push/send";
import { formatCurrency, formatDate } from "@/lib/format";
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

  const [
    { data: docsRaw, error },
    { data: profilesRaw },
    { data: subsRaw },
    { data: linksRaw },
    { data: notifsRaw },
  ] = await Promise.all([
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
    supabase
      .from("push_subscriptions")
      .select("profile_id,endpoint,p256dh,auth"),
    supabase.from("client_companies").select("profile_id,company_id"),
    // Todas as notificações já enviadas, de uma vez. Antes isto era 1 query por
    // documento dentro do loop (N+1); agora carregamos tudo e consultamos um Map
    // em memória — o loop não vai mais ao banco para checar "já notificado?".
    supabase.from("notifications").select("document_id,kind,sent_at"),
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

  // Assinaturas de Web Push por empresa. Via client_companies: quem tem acesso à
  // empresa recebe o push (espelha o alcance dos e-mails).
  const subsByProfile = new Map<string, PushSub[]>();
  for (const s of (subsRaw ?? []) as Array<{
    profile_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>) {
    const list = subsByProfile.get(s.profile_id) ?? [];
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByProfile.set(s.profile_id, list);
  }
  const subsByCompany = new Map<string, PushSub[]>();
  for (const l of (linksRaw ?? []) as Array<{
    profile_id: string;
    company_id: string;
  }>) {
    const subs = subsByProfile.get(l.profile_id);
    if (!subs?.length) continue;
    const list = subsByCompany.get(l.company_id) ?? [];
    list.push(...subs);
    subsByCompany.set(l.company_id, list);
  }

  // Índice das notificações já enviadas: chave "documentId:kind" -> sent_at.
  // Usar .has() para saber se existe (mesmo com sent_at nulo) e .get() p/ a data.
  const sentNotifByKey = new Map<string, string | null>();
  for (const n of (notifsRaw ?? []) as Array<{
    document_id: string;
    kind: string;
    sent_at: string | null;
  }>) {
    sentNotifByKey.set(`${n.document_id}:${n.kind}`, n.sent_at);
  }

  const docs = (docsRaw ?? []) as unknown as DocRow[];
  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  let processed = 0;
  let emailed = 0;
  let pushed = 0;
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

    // já notificado para esse documento + tipo de alerta? (consulta o índice
    // em memória, sem ir ao banco — ver sentNotifByKey acima).
    const notifKey = `${d.id}:${notifKind}`;
    const existing = sentNotifByKey.has(notifKey);
    if (existing) {
      const existingSentAt = sentNotifByKey.get(notifKey);
      const daysSince = existingSentAt
        ? Math.floor(
            (Date.now() - new Date(existingSentAt).getTime()) / MS_PER_DAY,
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

    // Web Push: mesmo gatilho do e-mail. Best-effort — nunca quebra o cron, e
    // assinaturas mortas são removidas dentro de sendPushToSubscriptions.
    const subs = subsByCompany.get(d.company_id);
    if (subs && subs.length > 0) {
      const { title, body } = pushTextFor(notifKind, d);
      const r = await sendPushToSubscriptions(supabase, subs, {
        title,
        body,
        url: `${portalBase}${portalPath}`,
        tag: `doc-${d.id}`,
      });
      pushed += r.sent;
    }

    if (existing) {
      // Recobrança do vencido: o unique(document_id, kind) impede inserir de
      // novo, então atualiza o registro existente (touch no sent_at). Identifica
      // a linha por document_id+kind (é a chave única) já que não trazemos o id.
      await supabase
        .from("notifications")
        .update({ channel, sent_at: new Date().toISOString() })
        .eq("document_id", d.id)
        .eq("kind", notifKind);
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
    pushed,
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

/** Título/corpo curtos da notificação push, conforme o tipo de alerta. */
function pushTextFor(
  kind: string,
  d: DocRow,
): { title: string; body: string } {
  const valor = formatCurrency(Number(d.amount) || 0);
  const venc = formatDate(d.due_date);
  const item = d.categoria === "parcelamento" ? "Parcela" : "Boleto";
  switch (kind) {
    case "vencido":
      return {
        title: `${item} vencido`,
        body: `Venceu em ${venc} — ${valor}. Regularize para evitar juros.`,
      };
    case "parcela_risco":
      return {
        title: "Parcela em risco",
        body: `Parcela vencida em ${venc} — ${valor}. Risco de exclusão do parcelamento.`,
      };
    case "vence_hoje":
      return {
        title: `${item} vence hoje`,
        body: `${valor} — vence hoje (${venc}).`,
      };
    case "dias_1":
      return {
        title: `${item} vence amanhã`,
        body: `${valor} — vence em ${venc}.`,
      };
    case "dias_3":
      return {
        title: `${item} a vencer`,
        body: `${valor} — vence em ${venc} (em 3 dias).`,
      };
    case "dias_7":
      return {
        title: `${item} a vencer`,
        body: `${valor} — vence em ${venc} (em 7 dias).`,
      };
    default:
      return {
        title: "Aviso de vencimento",
        body: `${valor} — vence em ${venc}.`,
      };
  }
}
