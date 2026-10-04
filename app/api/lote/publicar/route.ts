import { NextResponse } from "next/server";
import { contadorLogado, erroDoArquivo, validarGuia } from "@/lib/lote";
import { createClient } from "@/lib/supabase/server";

/**
 * Envio em lote — passo 2: publica UMA guia já conferida pelo contador (sobe o
 * PDF no bucket e cria o documento). Não avisa o cliente: o aviso sai no fim,
 * agrupado por cliente (/api/lote/notificar). Só o contador.
 */
export async function POST(request: Request) {
  const profile = await contadorLogado();
  if (!profile) {
    return NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 });
  }

  const fd = await request.formData();
  const file = fd.get("file");
  const erroArquivo = erroDoArquivo(file);
  if (erroArquivo) return NextResponse.json({ ok: false, erro: erroArquivo });

  const v = validarGuia(fd);
  if ("erro" in v) return NextResponse.json({ ok: false, erro: v.erro });
  const g = v.guia;

  const supabase = await createClient();
  const pdf = file as File;
  const docId = crypto.randomUUID();
  const safeName = pdf.name.replace(/[^\w.\-]+/g, "_");
  const path = `${g.companyId}/${docId}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("boletos")
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    return NextResponse.json({ ok: false, erro: `Falha ao enviar o arquivo: ${upErr.message}` });
  }

  const { error: insErr } = await supabase.from("documents").insert({
    id: docId,
    company_id: g.companyId,
    type: g.tipo,
    categoria: "boleto",
    descricao: g.descricao,
    competencia: g.competencia,
    amount: g.valor,
    due_date: g.vencimento,
    exige_comprovante: g.exigeComprovante,
    file_path: path,
    file_name: pdf.name,
    uploaded_by: profile.id,
  });
  if (insErr) {
    await supabase.storage.from("boletos").remove([path]); // desfaz o upload
    return NextResponse.json({ ok: false, erro: `Falha ao salvar: ${insErr.message}` });
  }

  return NextResponse.json({ ok: true, documentId: docId });
}
