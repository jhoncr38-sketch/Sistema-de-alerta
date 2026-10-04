"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getUserAndProfile } from "@/lib/auth";
import { notifyReissueRequest, notifySegundaViaAutomatica } from "@/lib/email/notify";
import { serproConfigurado } from "@/lib/serpro/auth";
import { gerarDas, vencimentoParaPublicar } from "@/lib/serpro/das";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DocType } from "@/lib/types";

/** Teto de 2ªs vias automáticas por empresa por dia (protege o custo do SERPRO). */
const MAX_POR_DIA = 10;

export interface SegundaViaResult {
  ok: boolean;
  /** Texto para o cliente. */
  mensagem: string;
  /** true = não deu para gerar; virou pedido ao contador. */
  pedidoAoContador?: boolean;
  /** true = a Receita diz que não há valor devido (provavelmente já pago). */
  semDebito?: boolean;
  valor?: number;
  pagarAte?: string;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const hojeBR = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * Plano B: registra o pedido de 2ª via para o contador (fluxo de antes) e
 * avisa por e-mail. Usado quando a geração automática não é possível.
 */
async function pedirAoContador(
  docId: string,
  motivo: string,
): Promise<SegundaViaResult> {
  console.warn(`[2a via] automática indisponível (${motivo}) — virou pedido ao contador`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_boleto_reissue", { p_document_id: docId });
  if (error) {
    return { ok: false, mensagem: "Não foi possível pedir a 2ª via agora. Tente de novo mais tarde." };
  }
  const { data: doc } = await supabase
    .from("documents")
    .select("company_id,type,competencia,amount,due_date")
    .eq("id", docId)
    .single();
  if (doc) {
    after(() =>
      notifyReissueRequest({
        companyId: doc.company_id,
        type: doc.type as DocType,
        competencia: doc.competencia,
        amount: doc.amount,
        dueDate: doc.due_date,
      }).catch((err) => console.error("[notify] 2a via:", err)),
    );
  }
  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/painel");
  return {
    ok: false,
    pedidoAoContador: true,
    mensagem: "Não consegui gerar a guia agora — pedimos a 2ª via ao seu contador.",
  };
}

/**
 * O CLIENTE gera a 2ª via de um DAS vencido, direto na Receita (PGDAS-D /
 * GERARDAS12), com multa e juros. A guia nova substitui a vencida no portal e o
 * contador é avisado. Qualquer impedimento vira o pedido de 2ª via de antes.
 *
 * Segurança: a guia é lida com o login do cliente (RLS — só as empresas dele);
 * o cliente não escolhe CNPJ nem período (vêm da própria guia). As escritas
 * usam a chave de serviço só depois dessa verificação.
 */
export async function gerarSegundaViaDas(docId: string): Promise<SegundaViaResult> {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile || profile.role !== "client") {
    return { ok: false, mensagem: "Sessão expirada. Entre de novo." };
  }

  // 1) A guia é do cliente? (RLS) É um DAS em aberto e vencido?
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, company_id, type, categoria, status, due_date, competencia, amount, exige_comprovante")
    .eq("id", docId)
    .maybeSingle();
  if (!doc) return { ok: false, mensagem: "Guia não encontrada." };
  if (doc.categoria !== "boleto" || doc.type !== "das") {
    return pedirAoContador(docId, "não é DAS");
  }
  if (doc.status !== "open") {
    return { ok: false, mensagem: "Esta guia não está em aberto." };
  }
  const hoje = hojeBR();
  if (!doc.due_date || doc.due_date >= hoje) {
    return { ok: false, mensagem: "Esta guia ainda está no prazo — use a que já está no portal." };
  }
  const m = (doc.competencia ?? "").match(/^(\d{2})\/(\d{4})$/);
  if (!m) return pedirAoContador(docId, "sem competência");
  const periodo = `${m[2]}${m[1]}`;

  if (!serproConfigurado()) return pedirAoContador(docId, "SERPRO não configurado");
  const contratante = digits(process.env.SERPRO_CONTRATANTE_CNPJ);
  const admin = createAdminClient();

  // 2) Teto diário por empresa (contamos as 2ªs vias automáticas de hoje).
  const { count } = await admin
    .from("boleto_reissue_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", doc.company_id)
    .eq("status", "resolved")
    .is("resolved_by", null)
    .gte("requested_at", `${hoje}T00:00:00-03:00`);
  if ((count ?? 0) >= MAX_POR_DIA) return pedirAoContador(docId, "teto diário");

  const { data: company } = await admin
    .from("companies")
    .select("cnpj")
    .eq("id", doc.company_id)
    .single();
  const contribuinte = digits(company?.cnpj);
  if (!contratante || contribuinte.length !== 14) return pedirAoContador(docId, "sem CNPJ");

  // Outra guia do mesmo mês já paga/aguardando? Não mexe — o contador vê.
  const { data: doMes } = await admin
    .from("documents")
    .select("id, status, file_path")
    .eq("company_id", doc.company_id)
    .eq("categoria", "boleto")
    .eq("type", "das")
    .eq("competencia", doc.competencia);
  const antigos = doMes ?? [];
  if (antigos.some((d) => d.status !== "open")) {
    return pedirAoContador(docId, "mês com guia paga/aguardando");
  }

  // 3) Gera na Receita (valor com multa/juros + data-limite).
  const instavel: SegundaViaResult = {
    ok: false,
    mensagem: "A Receita está demorando para responder agora. Tente de novo em alguns minutos.",
  };
  let r;
  try {
    r = await gerarDas({
      contratanteCnpj: contratante,
      autorCnpj: contratante,
      contribuinteCnpj: contribuinte,
      periodoApuracao: periodo,
    });
  } catch (err) {
    // Falha de rede/tempo com o SERPRO: o cliente tenta de novo (sem pedido).
    console.warn("[2a via] SERPRO indisponível:", err instanceof Error ? err.message : err);
    return instavel;
  }
  const vencimento = r.das ? vencimentoParaPublicar(r.das, hoje) : null;
  if (!r.ok || !r.das || r.das.valor == null || !vencimento || vencimento < hoje) {
    const motivo = r.erro ?? "";
    // "Não há valor devido para o período": a Receita não tem débito — a guia
    // do portal provavelmente já foi paga e ninguém marcou. Orienta o cliente.
    if (/MSG_E0139|valor devido/i.test(motivo)) {
      console.warn(`[2a via] sem débito na Receita para ${doc.competencia}: ${motivo}`);
      return {
        ok: false,
        semDebito: true,
        mensagem: `A Receita não mostra valor a pagar para ${doc.competencia} — esta guia provavelmente já foi paga. Se você já pagou, use "Já paguei" e anexe o comprovante.`,
      };
    }
    // Erro temporário do SERPRO (5xx, tempo esgotado): tenta de novo depois.
    if (r.status >= 500 || /HTTP 5\d\d/.test(motivo)) {
      console.warn(`[2a via] SERPRO instável (${r.status}): ${motivo}`);
      return instavel;
    }
    return pedirAoContador(docId, motivo || "DAS sem valor/data-limite");
  }
  const valor = r.das.valor;

  // 4) Substitui: sobe o PDF, cria a guia nova, apaga as antigas em aberto.
  const novoId = crypto.randomUUID();
  const fileName = `DAS-${periodo}-2via.pdf`;
  const path = `${doc.company_id}/${novoId}-${fileName}`;
  const { error: upErr } = await admin.storage
    .from("boletos")
    .upload(path, Buffer.from(r.das.pdfBase64, "base64"), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) return pedirAoContador(docId, `upload: ${upErr.message}`);

  const { error: insErr } = await admin.from("documents").insert({
    id: novoId,
    company_id: doc.company_id,
    type: "das",
    categoria: "boleto",
    competencia: doc.competencia,
    amount: valor,
    due_date: vencimento,
    exige_comprovante: doc.exige_comprovante,
    file_path: path,
    file_name: fileName,
    uploaded_by: null,
    first_viewed_at: new Date().toISOString(), // o próprio cliente gerou
  });
  if (insErr) {
    await admin.storage.from("boletos").remove([path]);
    return pedirAoContador(docId, `insert: ${insErr.message}`);
  }

  const idsAntigos = antigos.map((d) => d.id);
  if (idsAntigos.length) {
    await admin.from("documents").delete().in("id", idsAntigos);
    const paths = antigos.map((d) => d.file_path).filter((p): p is string => !!p);
    if (paths.length) await admin.storage.from("boletos").remove(paths);
  }

  // Histórico: registra a 2ª via (resolvida automaticamente) na guia nova.
  const agora = new Date().toISOString();
  await admin.from("boleto_reissue_requests").insert({
    document_id: novoId,
    company_id: doc.company_id,
    status: "resolved",
    requested_by: user.id,
    requested_at: agora,
    resolved_at: agora,
    resolved_by: null,
  });

  // 5) Avisa o contador (depois da resposta).
  after(() =>
    notifySegundaViaAutomatica({
      companyId: doc.company_id,
      competencia: doc.competencia,
      valorAnterior: doc.amount,
      valorNovo: valor,
      pagarAte: vencimento,
    }).catch((err) => console.error("[notify] 2a via automática:", err)),
  );

  revalidatePath("/portal");
  revalidatePath("/portal/boletos");
  revalidatePath("/painel");
  revalidatePath("/painel/documentos");

  return {
    ok: true,
    mensagem: "2ª via gerada na Receita, com o valor atualizado.",
    valor,
    pagarAte: vencimento,
  };
}
