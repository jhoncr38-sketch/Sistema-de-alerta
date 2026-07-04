"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeCompetencia } from "@/lib/dates";
import { notifyNewDocument } from "@/lib/email/notify";
import type { DocType } from "@/lib/types";

export interface UploadState {
  error?: string;
}

/** Converte "1.240,00" ou "1240.50" ou "1240" em número. */
function parseAmount(raw: string): number {
  let s = raw.trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) {
    // formato pt-BR: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return Number(s);
}

export async function uploadDocument(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { profile } = await requireAdmin();

  const companyId = String(formData.get("company_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const categoriaRaw = String(formData.get("categoria") ?? "boleto");
  const categoria: "boleto" | "documento" | "folha" =
    categoriaRaw === "documento"
      ? "documento"
      : categoriaRaw === "folha"
        ? "folha"
        : "boleto";
  const isBoleto = categoria === "boleto";
  // Só boleto pode exigir comprovante para o cliente marcar como pago.
  const exigeComprovante = isBoleto && formData.get("exige_comprovante") === "1";
  // Boleto e folha têm mês de referência; documento da empresa, não.
  const precisaCompetencia = categoria !== "documento";
  const competencia = normalizeCompetencia(
    String(formData.get("competencia") ?? ""),
  );

  // Folha pode ter vários arquivos (folha, recibo, frequência...). Boleto e
  // documento usam apenas um.
  const allFiles = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const files = isBoleto ? allFiles.slice(0, 1) : allFiles;

  if (!companyId || !type) {
    return { error: "Preencha todos os campos." };
  }
  if (precisaCompetencia && !competencia) {
    return { error: "Informe a competência (mês/ano)." };
  }

  // Boletos exigem valor e vencimento; documentos informativos, não.
  let amount: number | null = null;
  let dueDate: string | null = null;
  let faturamento: number | null = null;

  if (isBoleto) {
    const amountRaw = String(formData.get("amount") ?? "").trim();
    dueDate = String(formData.get("due_date") ?? "");
    if (!amountRaw || !dueDate) {
      return { error: "Informe o valor e o vencimento do boleto." };
    }
    amount = parseAmount(amountRaw);
    if (Number.isNaN(amount) || amount <= 0) {
      return { error: "Valor inválido. Ex.: 1.240,00" };
    }

    // Faturamento do mês é opcional. Se preenchido, alimenta o dashboard.
    const faturamentoRaw = String(formData.get("faturamento") ?? "").trim();
    if (faturamentoRaw) {
      faturamento = parseAmount(faturamentoRaw);
      if (Number.isNaN(faturamento) || faturamento < 0) {
        return { error: "Faturamento inválido. Ex.: 50.000,00" };
      }
    }
  }

  if (files.length === 0) {
    return { error: "Anexe ao menos um arquivo (PDF)." };
  }
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return { error: `O arquivo “${f.name}” é muito grande (máx. 10MB).` };
    }
  }

  const supabase = await createClient();

  // Sobe cada arquivo e monta uma linha de documento por arquivo (todos com a
  // mesma competência/categoria — agrupam por mês na tela do cliente).
  const uploadedPaths: string[] = [];
  const rows = [];
  for (const file of files) {
    const docId = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${companyId}/${docId}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("boletos")
      .upload(path, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      if (uploadedPaths.length) {
        await supabase.storage.from("boletos").remove(uploadedPaths);
      }
      return { error: `Falha ao enviar o arquivo: ${uploadError.message}` };
    }
    uploadedPaths.push(path);

    rows.push({
      id: docId,
      company_id: companyId,
      type,
      categoria,
      competencia: competencia || null, // documento da empresa pode não ter mês
      amount,
      due_date: dueDate,
      exige_comprovante: exigeComprovante,
      file_path: path,
      file_name: file.name,
      uploaded_by: profile.id,
    });
  }

  const { error: insertError } = await supabase.from("documents").insert(rows);

  if (insertError) {
    // desfaz os uploads se o registro falhar
    await supabase.storage.from("boletos").remove(uploadedPaths);
    return { error: `Falha ao salvar o registro: ${insertError.message}` };
  }

  // Faturamento do mês (opcional): 1 valor por empresa/competência.
  // Quando já existe faturamento no mês, o formulário avisa e o contador
  // escolhe o que fazer; o modo chega aqui:
  //   replace (padrão) = substitui o valor; add = soma ao existente; skip = mantém.
  const faturamentoMode = String(formData.get("faturamento_mode") ?? "replace");
  if (faturamento !== null && faturamentoMode !== "skip") {
    let amountToStore = faturamento;
    if (faturamentoMode === "add") {
      const { data: existing } = await supabase
        .from("revenues")
        .select("amount")
        .eq("company_id", companyId)
        .eq("competencia", competencia)
        .maybeSingle();
      if (existing) amountToStore = Number(existing.amount) + faturamento;
    }
    const { error: revenueError } = await supabase.from("revenues").upsert(
      {
        company_id: companyId,
        competencia,
        amount: amountToStore,
        uploaded_by: profile.id,
      },
      { onConflict: "company_id,competencia" },
    );
    if (revenueError) {
      // O documento já foi salvo; não desfazemos por causa do faturamento.
      return {
        error: `Documento salvo, mas falhou ao registrar o faturamento: ${revenueError.message}`,
      };
    }
  }

  // Avisa o cliente que há um novo documento disponível (depois da resposta).
  const firstDocId = rows[0].id;
  after(() =>
    notifyNewDocument({
      companyId,
      documentId: firstDocId,
      categoria,
      type: type as DocType,
      competencia: competencia || null,
      amount,
      dueDate,
      count: rows.length,
    }).catch((err) => console.error("[notify] novo documento:", err)),
  );

  revalidatePath("/painel/documentos");
  revalidatePath("/painel/faturamento");
  revalidatePath("/painel");
  // Já abre a tela filtrada pela empresa recém-enviada — o contador vê logo o
  // que acabou de publicar, sem precisar procurar entre todos os clientes.
  redirect(`/painel/documentos?company=${companyId}&ok=1`);
}
