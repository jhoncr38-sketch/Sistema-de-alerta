// Tipos de domínio do ContAlert (espelham o schema em supabase/migrations).

export type Role = "admin" | "client";
export type UserStatus = "pending" | "approved" | "rejected";
export type DocType =
  | "das"
  | "darf_irpj"
  | "darf_piscofins"
  | "darf_csll"
  | "gps_inss"
  | "iss"
  | "iss_rpa"
  | "icms"
  | "fgts"
  | "mensalidade"
  | "folha"
  | "relatorio_fiscal"
  | "cartao_cnpj"
  | "contrato_social"
  | "licenca"
  | "alvara"
  | "outro";
export type DocStatus = "open" | "paid";
export type DocCategoria = "boleto" | "documento" | "folha" | "parcelamento";

export interface Company {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  company_id: string | null;
  created_at: string;
}

export interface ProfileWithCompany extends Profile {
  company: Company | null;
}

export interface DocumentRow {
  id: string;
  company_id: string;
  type: DocType;
  categoria: DocCategoria;
  competencia: string | null; // documento da empresa não tem mês de referência
  amount: number | null; // null em documentos informativos
  due_date: string | null; // ISO date (YYYY-MM-DD); null em documentos informativos
  status: DocStatus;
  paid_at: string | null;
  comprovante_path: string | null; // comprovante de pagamento (opcional), no bucket 'boletos'
  comprovante_name: string | null; // nome original do arquivo do comprovante
  comprovante_at: string | null; // ISO timestamp de quando o comprovante foi anexado
  exige_comprovante: boolean; // quando true, o cliente só marca pago com comprovante anexado
  plan_id: string | null; // parcelamento ao qual a parcela pertence (categoria 'parcelamento')
  parcela_num: number | null; // número da parcela dentro do plano (1..total)
  file_path: string | null; // null em parcela de débito automático (sem boleto)
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface DocumentWithCompany extends DocumentRow {
  company: Pick<Company, "id" | "razao_social" | "nome_fantasia" | "email"> | null;
}

export interface InstallmentPlan {
  id: string;
  company_id: string;
  nome: string; // título do card (ex.: "Parcelamento Simples Nacional")
  modalidade: string; // modalidade do parcelamento (simples_nacional, inss, pgfn...)
  forma_pagamento: "boleto" | "debito_automatico"; // boleto mensal ou débito automático
  total: number; // total de parcelas do parcelamento (fixo)
  created_at: string;
  uploaded_by: string | null;
}

export interface InstallmentPlanWithCompany extends InstallmentPlan {
  company: Pick<Company, "id" | "razao_social" | "nome_fantasia"> | null;
}

export interface RevenueRow {
  id: string;
  company_id: string;
  competencia: string; // "MM/YYYY"
  amount: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  document_id: string;
  channel: "email" | "portal";
  kind:
    | "vence_hoje"
    | "dias_1"
    | "dias_3"
    | "dias_7"
    | "vencido"
    | "parcela_risco"
    | "novo_doc"
    | "pago";
  sent_at: string;
}

export interface AppSettingsRow {
  id: true;
  brand_name: string;
  logo_path: string | null;
  updated_at: string;
}
