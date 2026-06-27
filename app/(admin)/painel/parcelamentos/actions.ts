"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { modalidadeDocType, modalidadeLabel } from "@/lib/constants";

export interface PlanState {
  error?: string;
}

/** Converte "1.240,00" ou "1240.50" ou "1240" em número. */
function parseAmount(raw: string): number {
  let s = raw.trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return Number(s);
}

/** "2026-06-20" + n meses -> "2026-08-20" (mantém o dia). */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1 + n, d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Sobe um PDF de parcela e devolve {path}. Lança em caso de erro. */
async function uploadParcela(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  file: File,
): Promise<{ path: string }> {
  const docId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${companyId}/${docId}-${safeName}`;
  const { error } = await supabase.storage.from("boletos").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { path };
}

/**
 * Cria um parcelamento com TOTAL fixo (ex.: 22). As guias podem entrar agora
 * (as que o contador já tiver) ou depois, mês a mês (ver addParcela). O form
 * envia, em arrays paralelos, as parcelas anexadas: file, amount, due e num.
 */
export async function createInstallmentPlan(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const { profile } = await requireAdmin();

  const companyId = String(formData.get("company_id") ?? "");
  const modalidade = String(formData.get("modalidade") ?? "");
  let nome = String(formData.get("nome") ?? "").trim();
  const total = Number(String(formData.get("total") ?? "").trim());

  if (!companyId || !modalidade) {
    return { error: "Selecione o cliente e a modalidade." };
  }
  if (!Number.isInteger(total) || total < 1 || total > 999) {
    return { error: "Informe o total de parcelas (ex.: 22)." };
  }
  if (!nome) {
    if (modalidade === "outro") {
      return { error: "Dê um nome ao parcelamento." };
    }
    nome = modalidadeLabel(modalidade); // usa a modalidade como título
  }

  const debito =
    String(formData.get("forma_pagamento") ?? "boleto") === "debito_automatico";

  // ===== Débito automático: sem boleto. Gera TODAS as parcelas de uma vez,
  // a partir do valor e do 1º vencimento (mensal). =====
  if (debito) {
    const valor = parseAmount(String(formData.get("valor_parcela") ?? ""));
    const primeiro = String(formData.get("primeiro_venc") ?? "");
    if (Number.isNaN(valor) || valor <= 0) {
      return { error: "Informe o valor da parcela (ex.: 660,00)." };
    }
    if (!primeiro) {
      return { error: "Informe o vencimento da 1ª parcela." };
    }

    const supabase = await createClient();
    const docType = modalidadeDocType(modalidade);

    const { data: plan, error: planError } = await supabase
      .from("installment_plans")
      .insert({
        company_id: companyId,
        modalidade,
        nome,
        total,
        forma_pagamento: "debito_automatico",
        uploaded_by: profile.id,
      })
      .select("id")
      .single();
    if (planError || !plan) {
      return { error: `Falha ao criar o parcelamento: ${planError?.message}` };
    }

    // Uma linha por parcela: mesmo valor, vencimentos mensais, sem arquivo.
    const rows = Array.from({ length: total }, (_, i) => ({
      company_id: companyId,
      type: docType,
      categoria: "parcelamento" as const,
      competencia: null,
      amount: valor,
      due_date: addMonths(primeiro, i),
      plan_id: plan.id,
      parcela_num: i + 1,
      file_path: null,
      file_name: null,
      uploaded_by: profile.id,
    }));

    const { error: insertError } = await supabase.from("documents").insert(rows);
    if (insertError) {
      await supabase.from("installment_plans").delete().eq("id", plan.id);
      return { error: `Falha ao gerar as parcelas: ${insertError.message}` };
    }

    revalidatePath("/painel/parcelamentos");
    revalidatePath("/painel");
    revalidatePath("/portal/parcelamentos");
    redirect(`/painel/parcelamentos/${plan.id}?ok=1`);
  }

  // ===== Boleto: fluxo com PDFs (abaixo) =====
  // Parcelas anexadas agora (opcional — pode criar vazio e adicionar depois).
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const amounts = formData.getAll("amount").map(String);
  const dues = formData.getAll("due").map(String);
  const nums = formData.getAll("num").map((n) => Number(String(n)));

  if (
    files.length !== amounts.length ||
    files.length !== dues.length ||
    files.length !== nums.length
  ) {
    return { error: "Dados das parcelas inconsistentes. Tente novamente." };
  }

  const vistos = new Set<number>();
  for (let i = 0; i < files.length; i++) {
    if (files[i].size > 10 * 1024 * 1024) {
      return { error: `A parcela ${nums[i]} (“${files[i].name}”) passa de 10MB.` };
    }
    if (!Number.isInteger(nums[i]) || nums[i] < 1 || nums[i] > total) {
      return { error: `Número de parcela inválido (deve ser de 1 a ${total}).` };
    }
    if (vistos.has(nums[i])) {
      return { error: `Há duas parcelas com o número ${nums[i]}.` };
    }
    vistos.add(nums[i]);
    const amount = parseAmount(amounts[i]);
    if (Number.isNaN(amount) || amount <= 0) {
      return { error: `Valor inválido na parcela ${nums[i]}. Ex.: 1.240,00` };
    }
    if (!dues[i]) {
      return { error: `Informe o vencimento da parcela ${nums[i]}.` };
    }
  }

  const supabase = await createClient();
  const docType = modalidadeDocType(modalidade);

  // 1) Cria o plano (pai).
  const { data: plan, error: planError } = await supabase
    .from("installment_plans")
    .insert({
      company_id: companyId,
      modalidade,
      nome,
      total,
      forma_pagamento: "boleto",
      uploaded_by: profile.id,
    })
    .select("id")
    .single();
  if (planError || !plan) {
    return { error: `Falha ao criar o parcelamento: ${planError?.message}` };
  }

  // 2) Sobe os PDFs e monta as linhas de parcela.
  const uploadedPaths: string[] = [];
  const rows = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const { path } = await uploadParcela(supabase, companyId, files[i]);
      uploadedPaths.push(path);
      rows.push({
        company_id: companyId,
        type: docType,
        categoria: "parcelamento" as const,
        competencia: null,
        amount: parseAmount(amounts[i]),
        due_date: dues[i],
        plan_id: plan.id,
        parcela_num: nums[i],
        file_path: path,
        file_name: files[i].name,
        uploaded_by: profile.id,
      });
    } catch (e) {
      if (uploadedPaths.length) {
        await supabase.storage.from("boletos").remove(uploadedPaths);
      }
      await supabase.from("installment_plans").delete().eq("id", plan.id);
      return { error: `Falha ao enviar a parcela ${nums[i]}: ${(e as Error).message}` };
    }
  }

  // 3) Grava as parcelas. Se falhar, desfaz uploads e apaga o plano (cascata).
  if (rows.length) {
    const { error: insertError } = await supabase.from("documents").insert(rows);
    if (insertError) {
      await supabase.storage.from("boletos").remove(uploadedPaths);
      await supabase.from("installment_plans").delete().eq("id", plan.id);
      return { error: `Falha ao salvar as parcelas: ${insertError.message}` };
    }
  }

  revalidatePath("/painel/parcelamentos");
  revalidatePath("/painel");
  redirect(`/painel/parcelamentos/${plan.id}?ok=1`);
}

/**
 * Adiciona UMA parcela (a próxima guia do mês) a um parcelamento já criado.
 * Usado na página de detalhe. Não redireciona — o componente fecha e atualiza.
 */
export async function addParcela(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const { profile } = await requireAdmin();

  const planId = String(formData.get("plan_id") ?? "");
  const num = Number(String(formData.get("num") ?? "").trim());
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const due = String(formData.get("due") ?? "");
  const file = formData.get("file");

  if (!planId) return { error: "Parcelamento não informado." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Anexe o PDF da parcela." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "O arquivo passa de 10MB." };
  }

  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("installment_plans")
    .select("id, company_id, modalidade, total, forma_pagamento")
    .eq("id", planId)
    .single();
  if (!plan) return { error: "Parcelamento não encontrado." };
  if (plan.forma_pagamento === "debito_automatico") {
    return {
      error: "Débito automático já tem todas as parcelas geradas na criação.",
    };
  }

  if (!Number.isInteger(num) || num < 1 || num > plan.total) {
    return { error: `Número de parcela inválido (1 a ${plan.total}).` };
  }
  const amount = parseAmount(amountRaw);
  if (Number.isNaN(amount) || amount <= 0) {
    return { error: "Valor inválido. Ex.: 1.240,00" };
  }
  if (!due) return { error: "Informe o vencimento." };

  // Já existe essa parcela?
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("plan_id", planId)
    .eq("parcela_num", num)
    .maybeSingle();
  if (existing) {
    return { error: `A parcela ${num} já foi adicionada.` };
  }

  let path: string;
  try {
    ({ path } = await uploadParcela(supabase, plan.company_id, file));
  } catch (e) {
    return { error: `Falha ao enviar o arquivo: ${(e as Error).message}` };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    company_id: plan.company_id,
    type: modalidadeDocType(plan.modalidade),
    categoria: "parcelamento" as const,
    competencia: null,
    amount,
    due_date: due,
    plan_id: planId,
    parcela_num: num,
    file_path: path,
    file_name: file.name,
    uploaded_by: profile.id,
  });
  if (insertError) {
    await supabase.storage.from("boletos").remove([path]);
    return { error: `Falha ao salvar a parcela: ${insertError.message}` };
  }

  revalidatePath(`/painel/parcelamentos/${planId}`);
  revalidatePath("/painel/parcelamentos");
  revalidatePath("/portal/parcelamentos");
  return {};
}

/**
 * Apaga um parcelamento inteiro: o plano, suas parcelas (cascata no banco) e os
 * PDFs no storage. Só o contador (admin). NÃO redireciona — quem chama navega.
 */
export async function deleteInstallmentPlan(planId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: parcelas } = await supabase
    .from("documents")
    .select("file_path")
    .eq("plan_id", planId);

  const { error } = await supabase
    .from("installment_plans")
    .delete()
    .eq("id", planId);
  if (error) throw new Error(error.message);

  const paths = (parcelas ?? [])
    .map((p) => p.file_path)
    .filter((p): p is string => !!p);
  if (paths.length) {
    await supabase.storage.from("boletos").remove(paths);
  }

  revalidatePath("/painel/parcelamentos");
  revalidatePath("/painel");
  revalidatePath("/portal/parcelamentos");
}
