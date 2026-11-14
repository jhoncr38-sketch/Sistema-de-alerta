import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { docTypeLabel } from "@/lib/constants";
import { hojeBR } from "@/lib/dates";
import { notifyPaid } from "@/lib/email/notify";
import {
  casarPagamentos,
  type Criterio,
  type GuiaParaCasar,
  type PagamentoReceita,
  type TipoGuia,
} from "@/lib/pagamentos-casar";
import { creditPaymentOnTime } from "@/lib/rewards-credit";
import { serproConfigurado } from "@/lib/serpro/client";
import { consultarPagamentos, emitirComprovante } from "@/lib/serpro/pagamentos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocCategoria, DocType } from "@/lib/types";

/**
 * Pagamento confirmado pela Receita — a rotina que tira do cliente e do
 * contador o trabalho de "marcar como pago".
 *
 * Para cada empresa com guia federal em aberto (DAS, DARF, parcela), consulta
 * na Receita os pagamentos do período (PAGTOWEB/PAGAMENTOS71), casa cada
 * pagamento com a guia certa (lib/pagamentos-casar) e, para cada casamento:
 *   1. marca a guia como PAGA (origem 'receita', data = data de arrecadação);
 *   2. credita o SJ Rewards se foi paga em dia (pela data real de pagamento);
 *   3. avisa o cliente ("pagamento confirmado", o mesmo e-mail de sempre);
 *   4. anexa o comprovante oficial da Receita, se a guia ainda não tem um.
 *
 * Roda todo dia antes dos alertas de vencimento (vercel.json), para ninguém
 * receber cobrança de guia já paga. Também pode ser chamada à mão pelo contador.
 */

/** Guias que venceram há até ~4 meses... */
const DIAS_ATRAS = 120;
/** ...ou que vencem nos próximos 15 dias (quem paga antes do vencimento). */
const DIAS_FRENTE = 15;
/** A consulta busca pagamentos desde 45 dias antes do vencimento mais antigo. */
const MARGEM_CONSULTA_DIAS = 45;
/** Empresas consultadas ao mesmo tempo (não sobrecarregar o SERPRO). */
const PARALELO = 3;

const DARF_TYPES = new Set<string>(["darf_irpj", "darf_piscofins", "darf_csll", "gps_inss"]);

interface GuiaAberta {
  id: string;
  company_id: string;
  type: DocType;
  categoria: DocCategoria;
  competencia: string | null;
  amount: number | null;
  due_date: string | null;
  status: "open" | "aguardando";
  numero_documento: string | null;
  file_name: string | null;
  comprovante_path: string | null;
  plan: { modalidade: string } | null;
  company: {
    cnpj: string | null;
    razao_social: string;
    nome_fantasia: string | null;
    active: boolean | null;
  } | null;
}

export interface ConfirmacaoReceita {
  docId: string;
  companyId: string;
  empresa: string;
  /** "DAS 09/2026" */
  guia: string;
  valorGuia: number | null;
  valorPago: number;
  dataArrecadacao: string | null;
  numeroDocumento: string;
  criterio: Criterio;
  /** O comprovante oficial foi anexado agora. */
  comprovante: boolean;
}

export interface ResultadoVerificacao {
  ok: boolean;
  erro?: string;
  dryRun: boolean;
  empresasConsultadas: number;
  guiasVerificadas: number;
  confirmadas: ConfirmacaoReceita[];
  falhas: { empresa: string; erro: string }[];
}

const somarDias = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/** Como a guia é reconhecida na Receita (null = só pelo número do documento). */
function tipoGuia(g: GuiaAberta): TipoGuia {
  if (g.type === "das") return "das";
  if (DARF_TYPES.has(g.type)) return "darf";
  const nome = g.file_name ?? "";
  if (g.type === "outro" && /^DARF-/i.test(nome)) return "darf";
  if (g.type === "outro" && /^Parcela-/i.test(nome)) return "parcela";
  if (
    g.categoria === "parcelamento" &&
    (g.plan?.modalidade === "receita_federal" || g.plan?.modalidade === "pgfn")
  ) {
    return "parcela";
  }
  return null;
}

function nomeDaGuia(g: GuiaAberta): string {
  const rotulo = g.categoria === "parcelamento" ? "Parcela" : docTypeLabel(g.type);
  return g.competencia ? `${rotulo} ${g.competencia}` : rotulo;
}

/** Executa `fn` em cada item, no máximo `n` ao mesmo tempo. */
async function emLotes<T>(itens: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) await fn(itens[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
}

/**
 * Marca UMA guia como paga pela Receita e faz o resto (rewards, e-mail,
 * comprovante). Devolve false se a guia mudou no meio do caminho (alguém
 * marcou/apagou) — nesse caso não mexe em nada.
 */
async function aplicarPagamento(
  admin: SupabaseClient,
  g: GuiaAberta,
  p: PagamentoReceita,
  criterio: Criterio,
  cnpjs: { contratante: string; contribuinte: string },
  hoje: string,
): Promise<{ aplicado: boolean; comprovante: boolean }> {
  const quando = p.dataArrecadacao ?? hoje;
  const momento = `${quando}T12:00:00-03:00`;

  const { data: atualizadas, error } = await admin
    .from("documents")
    .update({
      status: "paid",
      paid_at: momento,
      // Base do "pago em dia" do SJ Rewards: a data REAL do pagamento.
      marcado_pago_at: momento,
      pago_origem: "receita",
      numero_documento: g.numero_documento ?? p.numeroDocumento,
      pagamento_receita: {
        numeroDocumento: p.numeroDocumento,
        tipo: p.tipo,
        dataArrecadacao: p.dataArrecadacao,
        valorTotal: p.valorTotal,
        criterio,
        verificadoEm: new Date().toISOString(),
      },
    })
    .eq("id", g.id)
    .in("status", ["open", "aguardando"]) // idempotente: só se ainda está a pagar
    .select("id");
  if (error) throw new Error(error.message);
  if (!atualizadas?.length) return { aplicado: false, comprovante: false };

  // SJ Rewards: "guia paga em dia" pela data de arrecadação. Idempotente por guia.
  await creditPaymentOnTime(admin, {
    id: g.id,
    companyId: g.company_id,
    categoria: g.categoria,
    type: g.type,
    dueDate: g.due_date,
    paidAt: quando,
  }).catch((err) => console.error("[pagamentos] rewards:", err));

  // Avisa o cliente (mesmo e-mail da confirmação manual; não repete).
  await notifyPaid({
    documentId: g.id,
    companyId: g.company_id,
    categoria: g.categoria,
    type: g.type,
    competencia: g.competencia,
    amount: g.amount,
  }).catch((err) => console.error("[pagamentos] e-mail:", err));

  // Comprovante oficial da Receita, se a guia ainda não tem um.
  let comprovante = false;
  if (!g.comprovante_path) {
    try {
      const c = await emitirComprovante({
        contratanteCnpj: cnpjs.contratante,
        autorCnpj: cnpjs.contratante,
        contribuinteCnpj: cnpjs.contribuinte,
        numeroDocumento: p.numeroDocumento,
      });
      if (c.ok) {
        const nome = `Comprovante-Receita-${p.numeroDocumento}.pdf`;
        const path = `${g.company_id}/comprovantes/${g.id}-${nome}`;
        const { error: upErr } = await admin.storage
          .from("boletos")
          .upload(path, Buffer.from(c.pdfBase64, "base64"), {
            contentType: "application/pdf",
            upsert: true,
          });
        if (!upErr) {
          const { error: updErr } = await admin
            .from("documents")
            .update({
              comprovante_path: path,
              comprovante_name: nome,
              comprovante_at: new Date().toISOString(),
            })
            .eq("id", g.id)
            .is("comprovante_path", null);
          comprovante = !updErr;
          if (updErr) await admin.storage.from("boletos").remove([path]);
        }
      } else {
        console.warn(`[pagamentos] comprovante ${p.numeroDocumento}: ${c.erro}`);
      }
    } catch (err) {
      console.warn("[pagamentos] comprovante:", err instanceof Error ? err.message : err);
    }
  }

  return { aplicado: true, comprovante };
}

/**
 * Verifica na Receita os pagamentos das guias federais em aberto. Sem
 * `companyId`, varre todas as empresas. Com `dryRun`, só consulta e diz o que
 * SERIA marcado como pago — não grava, não avisa, não baixa comprovante.
 */
export async function verificarPagamentosNaReceita(
  opts: { companyId?: string; dryRun?: boolean } = {},
): Promise<ResultadoVerificacao> {
  const dryRun = !!opts.dryRun;
  const vazio: ResultadoVerificacao = {
    ok: true,
    dryRun,
    empresasConsultadas: 0,
    guiasVerificadas: 0,
    confirmadas: [],
    falhas: [],
  };

  if (!serproConfigurado()) {
    return { ...vazio, ok: false, erro: "Integração SERPRO não configurada." };
  }
  const contratante = (process.env.SERPRO_CONTRATANTE_CNPJ ?? "").replace(/\D/g, "");
  if (!contratante) {
    return { ...vazio, ok: false, erro: "Falta SERPRO_CONTRATANTE_CNPJ." };
  }

  const admin = createAdminClient();
  const hoje = hojeBR();
  const desde = somarDias(hoje, -DIAS_ATRAS);
  const ate = somarDias(hoje, DIAS_FRENTE);

  // Guias com vencimento na janela — ou sem vencimento (ex.: parcela emitida
  // pela Receita), recentes e com nº do documento (casam só pelo número).
  let consulta = admin
    .from("documents")
    .select(
      "id,company_id,type,categoria,competencia,amount,due_date,status,numero_documento,file_name,comprovante_path,plan:installment_plans(modalidade),company:companies(cnpj,razao_social,nome_fantasia,active)",
    )
    .in("status", ["open", "aguardando"])
    .in("categoria", ["boleto", "parcelamento"])
    .or(
      `and(due_date.gte.${desde},due_date.lte.${ate}),` +
        `and(due_date.is.null,numero_documento.not.is.null,created_at.gte.${desde})`,
    );
  if (opts.companyId) consulta = consulta.eq("company_id", opts.companyId);

  const { data, error } = await consulta;
  if (error) {
    return {
      ...vazio,
      ok: false,
      erro: /numero_documento|pago_origem/.test(error.message)
        ? "Falta aplicar a migração 0040_pagamento_receita.sql no banco."
        : error.message,
    };
  }

  // Só guias federais (ou com número de documento) de empresas ativas com CNPJ.
  const porEmpresa = new Map<string, GuiaAberta[]>();
  for (const g of (data ?? []) as unknown as GuiaAberta[]) {
    if ((!g.due_date && !g.numero_documento) || g.company?.active === false) continue;
    const cnpj = (g.company?.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14 && cnpj.length !== 11) continue;
    if (!tipoGuia(g) && !g.numero_documento) continue;
    const lista = porEmpresa.get(g.company_id) ?? [];
    lista.push(g);
    porEmpresa.set(g.company_id, lista);
  }

  const resultado: ResultadoVerificacao = { ...vazio };

  await emLotes([...porEmpresa.values()], PARALELO, async (guias) => {
    const primeira = guias[0];
    const empresa = primeira.company?.nome_fantasia || primeira.company?.razao_social || "empresa";
    const contribuinte = (primeira.company?.cnpj ?? "").replace(/\D/g, "");
    // Sem vencimento conta como "o mais antigo possível" da janela.
    const maisAntigo = guias.map((g) => g.due_date ?? desde).sort()[0];

    resultado.empresasConsultadas++;
    resultado.guiasVerificadas += guias.length;

    let pagamentos: PagamentoReceita[];
    try {
      const r = await consultarPagamentos({
        contratanteCnpj: contratante,
        autorCnpj: contratante,
        contribuinteCnpj: contribuinte,
        dataInicial: somarDias(maisAntigo, -MARGEM_CONSULTA_DIAS),
        dataFinal: hoje,
      });
      if (!r.ok) {
        resultado.falhas.push({ empresa, erro: r.erro });
        return;
      }
      pagamentos = r.pagamentos;
    } catch (err) {
      resultado.falhas.push({
        empresa,
        erro: err instanceof Error ? err.message : "Falha ao consultar a Receita.",
      });
      return;
    }
    if (pagamentos.length === 0) return;

    const paraCasar: GuiaParaCasar[] = guias.map((g) => ({
      id: g.id,
      tipoGuia: tipoGuia(g),
      competencia: g.competencia,
      valor: g.amount == null ? null : Number(g.amount),
      vencimento: g.due_date,
      numeroDocumento: g.numero_documento,
    }));
    const porId = new Map(guias.map((g) => [g.id, g]));

    for (const c of casarPagamentos(paraCasar, pagamentos)) {
      const g = porId.get(c.guiaId)!;
      let comprovante = false;
      if (!dryRun) {
        try {
          const r = await aplicarPagamento(admin, g, c.pagamento, c.criterio, { contratante, contribuinte }, hoje);
          if (!r.aplicado) continue;
          comprovante = r.comprovante;
        } catch (err) {
          resultado.falhas.push({
            empresa,
            erro: `${nomeDaGuia(g)}: ${err instanceof Error ? err.message : "falha ao marcar como paga"}`,
          });
          continue;
        }
      }
      resultado.confirmadas.push({
        docId: g.id,
        companyId: g.company_id,
        empresa,
        guia: nomeDaGuia(g),
        valorGuia: g.amount == null ? null : Number(g.amount),
        valorPago: c.pagamento.valorTotal,
        dataArrecadacao: c.pagamento.dataArrecadacao,
        numeroDocumento: c.pagamento.numeroDocumento,
        criterio: c.criterio,
        comprovante,
      });
    }
  });

  if (!dryRun && resultado.confirmadas.length > 0) {
    revalidatePath("/portal");
    revalidatePath("/portal/boletos");
    revalidatePath("/portal/parcelamentos");
    revalidatePath("/painel", "layout");
    revalidatePath("/painel/documentos");
  }

  return resultado;
}
