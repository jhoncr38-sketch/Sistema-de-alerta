// Tipos de domínio do ContAlert (espelham o schema em supabase/migrations).

export type Role = "admin" | "client";
export type UserStatus = "pending" | "approved" | "rejected";
export type DocType =
  | "das"
  | "darf_irpj"
  | "darf_piscofins"
  | "gps_inss"
  | "iss"
  | "fgts"
  | "folha"
  | "relatorio_fiscal"
  | "outro";
export type DocStatus = "open" | "paid";
export type DocCategoria = "boleto" | "documento";

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
  competencia: string;
  amount: number | null; // null em documentos informativos
  due_date: string | null; // ISO date (YYYY-MM-DD); null em documentos informativos
  status: DocStatus;
  paid_at: string | null;
  file_path: string;
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface DocumentWithCompany extends DocumentRow {
  company: Pick<Company, "id" | "razao_social" | "nome_fantasia" | "email"> | null;
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
  kind: "vence_hoje" | "dias_3" | "vencido";
  sent_at: string;
}

export interface AppSettingsRow {
  id: true;
  brand_name: string;
  logo_path: string | null;
  updated_at: string;
}
