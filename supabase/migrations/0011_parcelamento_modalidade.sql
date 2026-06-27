-- ============================================================
-- ContAlert — Parcelamento: modalidade no lugar de "tipo de guia"
-- Rode DEPOIS de 0010_parcelamento.sql, no SQL Editor do Supabase.
--
-- O parcelamento não é classificado por imposto (DAS, DARF...), e sim por
-- MODALIDADE (Simples Nacional, INSS, FGTS, PGFN, Receita Federal...). Trocamos
-- a coluna doc_type por um texto livre de modalidade. (Sem mexer no enum, então
-- roda em bloco único.)
-- ============================================================

alter table public.installment_plans drop column if exists type;

alter table public.installment_plans
  add column if not exists modalidade text not null default 'outro';
