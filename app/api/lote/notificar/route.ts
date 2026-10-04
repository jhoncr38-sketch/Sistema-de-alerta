import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { notifyNovasGuias } from "@/lib/email/notify";
import { contadorLogado } from "@/lib/lote";
import { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

/**
 * Envio em lote — passo 3: depois de publicar, avisa cada cliente UMA vez, com
 * a lista das guias dele (em vez de um e-mail por guia). Os e-mails saem depois
 * da resposta (after). Só o contador.
 */
export async function POST(request: Request) {
  if (!(await contadorLogado())) {
    return NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { documentIds?: unknown } | null;
  const ids = Array.isArray(body?.documentIds)
    ? body.documentIds.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, empresas: 0 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, company_id, type, descricao, competencia, amount, due_date")
    .in("id", ids);

  const porEmpresa = new Map<string, NonNullable<typeof data>>();
  for (const d of data ?? []) {
    if (!porEmpresa.has(d.company_id)) porEmpresa.set(d.company_id, []);
    porEmpresa.get(d.company_id)!.push(d);
  }

  after(async () => {
    for (const [companyId, docs] of porEmpresa) {
      await notifyNovasGuias({
        companyId,
        guias: docs
          .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
          .map((d) => ({
            documentId: d.id,
            type: d.type as DocType,
            descricao: d.descricao,
            competencia: d.competencia,
            amount: d.amount,
            dueDate: d.due_date,
          })),
      }).catch((err) => console.error("[notify] lote:", err));
    }
  });

  revalidatePath("/painel", "layout");
  revalidatePath("/painel/documentos");
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");

  return NextResponse.json({ ok: true, empresas: porEmpresa.size });
}
