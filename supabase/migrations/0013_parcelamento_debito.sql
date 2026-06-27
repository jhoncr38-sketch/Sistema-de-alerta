-- ============================================================
-- ContAlert — Parcelamento em débito automático
-- Rode DEPOIS de 0012_comprovante.sql, no SQL Editor do Supabase.
--
-- Alguns parcelamentos são pagos por DÉBITO AUTOMÁTICO: não há boleto mensal,
-- apenas a informação de que o débito ocorreu (ou não) no mês. Para suportar:
--   1) installment_plans ganha 'forma_pagamento' (boleto | debito_automatico);
--   2) as parcelas (documents) passam a poder existir SEM arquivo, então
--      file_path e file_name viram opcionais.
-- ============================================================

-- ----- Forma de pagamento do parcelamento (registros antigos = 'boleto') -----
alter table public.installment_plans
  add column if not exists forma_pagamento text not null default 'boleto';

-- ----- Parcela pode não ter arquivo (débito automático não tem boleto) -----
alter table public.documents alter column file_path drop not null;
alter table public.documents alter column file_name drop not null;
