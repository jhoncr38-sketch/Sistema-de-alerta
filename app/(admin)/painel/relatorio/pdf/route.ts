import { NextResponse } from "next/server";
import { getUserAndProfile } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { currentCompetenciaKey } from "@/lib/dates";
import type { RevenueInput } from "@/lib/faturamento";
import {
  montarRelatorio,
  montarView,
  prevMonthKey,
  type RelatorioDoc,
} from "@/lib/relatorio";
import { fetchLogoDataUri, renderRelatorioPdf } from "@/lib/relatorio-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gera e devolve o PDF do relatório mensal (o MESMO que é anexado no e-mail),
 * para o contador visualizar/baixar. Só admin. `?empresa=<id>&mes=YYYY-MM`.
 */
export async function GET(request: Request) {
  const { profile } = await getUserAndProfile();
  if (!profile || profile.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const empresa = url.searchParams.get("empresa");
  if (!empresa) return new NextResponse("empresa ausente", { status: 400 });

  const currentKey = currentCompetenciaKey();
  const mesParam = url.searchParams.get("mes");
  let competencia =
    mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : prevMonthKey(currentKey);
  if (competencia > currentKey) competencia = currentKey;

  const supabase = await createClient();
  const [{ data: company }, { data: docsRaw }, { data: revenuesRaw }, branding] =
    await Promise.all([
      supabase
        .from("companies")
        .select("razao_social, nome_fantasia, cnpj")
        .eq("id", empresa)
        .single(),
      supabase
        .from("documents")
        .select(
          "id, type, categoria, amount, due_date, status, marcado_pago_at, paid_at, competencia, parcela_num",
        )
        .eq("company_id", empresa),
      supabase.from("revenues").select("competencia, amount").eq("company_id", empresa),
      getBranding(),
    ]);

  if (!company) return new NextResponse("empresa não encontrada", { status: 404 });
  const c = company as {
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string | null;
  };
  const companyName = c.nome_fantasia || c.razao_social;

  const model = montarRelatorio(
    (docsRaw ?? []) as RelatorioDoc[],
    (revenuesRaw ?? []) as RevenueInput[],
    competencia,
    companyName,
  );
  const view = montarView(model, {
    brandName: branding.name,
    logoUrl: branding.logoUrl,
    cnpj: c.cnpj ?? null,
  });
  const logoData = await fetchLogoDataUri(branding.logoUrl);
  const pdf = await renderRelatorioPdf(view, logoData);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-${competencia}.pdf"`,
    },
  });
}
