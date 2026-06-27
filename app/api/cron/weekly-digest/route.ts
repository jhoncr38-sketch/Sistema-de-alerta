import { NextResponse } from "next/server";
import { getUrgency } from "@/lib/dates";
import { sendEmail } from "@/lib/email/resend";
import { weeklyDigestEmail, type DigestItem } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DocRow {
  id: string;
  type: DocType;
  categoria: "boleto" | "parcelamento";
  competencia: string | null;
  amount: number | null;
  due_date: string;
  company_id: string;
  company: {
    razao_social: string;
    nome_fantasia: string | null;
    email: string | null;
  } | null;
}

/** Data local (YYYY-MM-DD) — mesma referência usada por getUrgency. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resumo semanal (Vercel Cron, segundas — ver vercel.json): um único e-mail por
 * empresa com tudo que está em aberto e vence até 7 dias à frente (inclui o que
 * já venceu). É só um lembrete consolidado — não registra notificações.
 *
 * Protegido por CRON_SECRET. Teste manual: /api/cron/weekly-digest?secret=<...>
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
  const end = isoDate(new Date(Date.now() + 7 * 86_400_000));

  const [{ data: docsRaw, error }, { data: profilesRaw }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id,type,categoria,competencia,amount,due_date,company_id,company:companies(razao_social,nome_fantasia,email)",
      )
      .eq("status", "open")
      .in("categoria", ["boleto", "parcelamento"])
      .lte("due_date", end)
      .order("due_date", { ascending: true }),
    supabase
      .from("profiles")
      .select("email,company_id")
      .eq("role", "client")
      .eq("status", "approved"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emailsByCompany = new Map<string, string[]>();
  for (const p of profilesRaw ?? []) {
    if (p.company_id && p.email) {
      const list = emailsByCompany.get(p.company_id) ?? [];
      list.push(p.email);
      emailsByCompany.set(p.company_id, list);
    }
  }

  // Agrupa as guias em aberto por empresa.
  const byCompany = new Map<
    string,
    { name: string; email: string | null; items: DigestItem[] }
  >();
  for (const d of (docsRaw ?? []) as unknown as DocRow[]) {
    const { urgency, days } = getUrgency(d.due_date, "open");
    const statusLabel =
      urgency === "vencido"
        ? "Vencido"
        : urgency === "vence_hoje"
          ? "Vence hoje"
          : `em ${days} ${days === 1 ? "dia" : "dias"}`;
    const g = byCompany.get(d.company_id) ?? {
      name: d.company?.nome_fantasia || d.company?.razao_social || "Cliente",
      email: d.company?.email ?? null,
      items: [],
    };
    g.items.push({
      type: d.type,
      competencia: d.competencia,
      amount: d.amount,
      dueDate: d.due_date,
      statusLabel,
      isParcela: d.categoria === "parcelamento",
    });
    byCompany.set(d.company_id, g);
  }

  const portalBase = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  let emailed = 0;
  for (const [companyId, g] of byCompany) {
    const recipients = Array.from(
      new Set([
        ...(emailsByCompany.get(companyId) ?? []),
        ...(g.email ? [g.email] : []),
      ]),
    );
    if (recipients.length === 0) continue;
    const { subject, html } = weeklyDigestEmail({
      companyName: g.name,
      items: g.items,
      portalUrl: `${portalBase}/portal/boletos`,
    });
    await sendEmail({ to: recipients, subject, html });
    emailed++;
  }

  return NextResponse.json({ ok: true, companies: byCompany.size, emailed });
}
