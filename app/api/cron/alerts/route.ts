import { NextResponse } from "next/server";
import { alertKind } from "@/lib/dates";
import { sendEmail } from "@/lib/email/resend";
import { alertEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DocRow {
  id: string;
  type: DocType;
  competencia: string;
  amount: number;
  due_date: string;
  status: "open" | "paid";
  company_id: string;
  company: {
    razao_social: string;
    nome_fantasia: string | null;
    email: string | null;
  } | null;
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
        "id,type,competencia,amount,due_date,status,company_id,company:companies(razao_social,nome_fantasia,email)",
      )
      .eq("status", "open")
      .eq("categoria", "boleto"), // documentos informativos não têm vencimento/alerta
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

    // já notificado para esse documento + tipo de alerta?
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("document_id", d.id)
      .eq("kind", kind)
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

    let channel: "email" | "portal" = "portal";
    if (recipients.length > 0) {
      const { subject, html } = alertEmail({
        companyName,
        type: d.type,
        competencia: d.competencia,
        amount: Number(d.amount),
        dueDate: d.due_date,
        kind,
        portalUrl: `${portalBase}/portal/boletos`,
      });
      await sendEmail({ to: recipients, subject, html });
      channel = "email";
      emailed++;
    }

    await supabase
      .from("notifications")
      .insert({ document_id: d.id, channel, kind });
    processed++;
  }

  return NextResponse.json({
    ok: true,
    total: docs.length,
    processed,
    emailed,
    alreadySent,
  });
}
